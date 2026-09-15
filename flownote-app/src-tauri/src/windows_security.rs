use crate::file_error::{FileError, FileResult};
use std::fs::File;
use std::os::windows::io::AsRawHandle;
use windows_sys::Win32::Foundation::ERROR_INSUFFICIENT_BUFFER;
use windows_sys::Win32::Security::*;

const ACCESS_INFORMATION: u32 = OWNER_SECURITY_INFORMATION | GROUP_SECURITY_INFORMATION | DACL_SECURITY_INFORMATION;
const READ_INFORMATION: u32 = ACCESS_INFORMATION | LABEL_SECURITY_INFORMATION;

#[derive(Clone)]
pub struct FileSecurity { buffer: Vec<usize> }

#[derive(PartialEq)]
struct Dacl { present: bool, protected: bool, entries: Option<Vec<Vec<u8>>> }

fn security_error(context: &str) -> FileError {
    FileError::io(context, std::io::Error::last_os_error())
}

impl FileSecurity {
    pub fn read(file: &File) -> FileResult<Self> {
        let mut needed = 0;
        unsafe { GetKernelObjectSecurity(file.as_raw_handle(), READ_INFORMATION, std::ptr::null_mut(), 0, &mut needed); }
        if std::io::Error::last_os_error().raw_os_error() != Some(ERROR_INSUFFICIENT_BUFFER as i32) {
            return Err(security_error("无法读取文件安全描述符"));
        }
        let mut value = Self { buffer: vec![0; (needed as usize).div_ceil(std::mem::size_of::<usize>())] };
        let success = unsafe { GetKernelObjectSecurity(file.as_raw_handle(), READ_INFORMATION, value.pointer(), needed, &mut needed) };
        if success == 0 { return Err(security_error("读取文件安全描述符失败")); }
        value.check_label()?;
        Ok(value)
    }

    fn pointer(&mut self) -> PSECURITY_DESCRIPTOR { self.buffer.as_mut_ptr().cast() }

    fn check_label(&mut self) -> FileResult<()> {
        let (mut present, mut defaulted, mut acl) = (0, 0, std::ptr::null_mut());
        let success = unsafe { GetSecurityDescriptorSacl(self.pointer(), &mut present, &mut acl, &mut defaulted) };
        if success == 0 { return Err(security_error("检查文件安全标签失败")); }
        if present != 0 && !acl.is_null() && unsafe { (*acl).AceCount } != 0 {
            return Err(FileError::new("unsupportedMetadata", "文件有特殊安全标签，当前无法保留，请使用另存为"));
        }
        Ok(())
    }

    pub fn creation_attributes(&mut self) -> FileResult<SECURITY_ATTRIBUTES> {
        // Protect even an originally inherited DACL while creating the empty object.
        let success = unsafe { SetSecurityDescriptorControl(self.pointer(), SE_DACL_PROTECTED, SE_DACL_PROTECTED) };
        if success == 0 { return Err(security_error("准备暂存文件权限失败")); }
        Ok(SECURITY_ATTRIBUTES { nLength: std::mem::size_of::<SECURITY_ATTRIBUTES>() as u32,
            lpSecurityDescriptor: self.pointer(), bInheritHandle: 0 })
    }

    fn control(&mut self) -> FileResult<u16> {
        let (mut control, mut revision) = (0, 0);
        if unsafe { GetSecurityDescriptorControl(self.pointer(), &mut control, &mut revision) } == 0 {
            return Err(security_error("读取文件权限继承标志失败"));
        }
        Ok(control)
    }

    fn principals(&mut self) -> FileResult<(PSID, PSID)> {
        let (mut owner, mut group, mut defaulted) = (std::ptr::null_mut(), std::ptr::null_mut(), 0);
        let success = unsafe {
            GetSecurityDescriptorOwner(self.pointer(), &mut owner, &mut defaulted) != 0
                && GetSecurityDescriptorGroup(self.pointer(), &mut group, &mut defaulted) != 0
        };
        if !success { return Err(security_error("读取文件所有者失败")); }
        Ok((owner, group))
    }

    fn dacl(&mut self) -> FileResult<Dacl> {
        let (mut present, mut defaulted, mut acl) = (0, 0, std::ptr::null_mut());
        if unsafe { GetSecurityDescriptorDacl(self.pointer(), &mut present, &mut acl, &mut defaulted) } == 0 {
            return Err(security_error("读取文件访问规则失败"));
        }
        let entries = if acl.is_null() { None } else { Some(acl_entries(acl)?) };
        Ok(Dacl { present: present != 0, protected: self.control()? & SE_DACL_PROTECTED != 0, entries })
    }

    fn equivalent(&mut self, other: &mut Self) -> FileResult<bool> {
        let (owner, group) = self.principals()?;
        let (other_owner, other_group) = other.principals()?;
        Ok(same_sid(owner, other_owner) && same_sid(group, other_group) && self.dacl()? == other.dacl()?)
    }

    pub fn matches_file(&mut self, file: &File) -> FileResult<bool> {
        self.equivalent(&mut Self::read(file)?)
    }

    pub fn fingerprint(&mut self) -> FileResult<Vec<u8>> {
        let (owner, group) = self.principals()?;
        let mut bytes = Vec::new();
        for principal in [owner, group] {
            let size = if principal.is_null() { 0 } else { unsafe { GetLengthSid(principal) } };
            bytes.extend_from_slice(&size.to_le_bytes());
            if size != 0 { bytes.extend_from_slice(unsafe { std::slice::from_raw_parts(principal.cast::<u8>(), size as usize) }); }
        }
        let dacl = self.dacl()?;
        bytes.extend_from_slice(&[u8::from(dacl.present), u8::from(dacl.protected), u8::from(dacl.entries.is_some())]);
        for entry in dacl.entries.unwrap_or_default() {
            bytes.extend_from_slice(&(entry.len() as u64).to_le_bytes());
            bytes.extend_from_slice(&entry);
        }
        Ok(bytes)
    }

    pub fn apply_and_verify(&mut self, file: &File) -> FileResult<()> {
        let inheritance = if self.control()? & SE_DACL_PROTECTED != 0 {
            PROTECTED_DACL_SECURITY_INFORMATION
        } else { UNPROTECTED_DACL_SECURITY_INFORMATION };
        // This API preserves the supplied ACL rather than recalculating parent inheritance.
        let success = unsafe { SetKernelObjectSecurity(file.as_raw_handle(), ACCESS_INFORMATION | inheritance, self.pointer()) };
        if success == 0 { return Err(security_error("保留文件权限失败，尚未写入正文")); }
        if !self.matches_file(file)? {
            return Err(FileError::new("unsupportedMetadata", "无法完整保留文件访问权限，尚未写入正文，请使用另存为"));
        }
        Ok(())
    }
}

fn same_sid(left: PSID, right: PSID) -> bool {
    if left.is_null() || right.is_null() { return left == right; }
    unsafe { EqualSid(left, right) != 0 }
}

fn acl_entries(acl: *mut ACL) -> FileResult<Vec<Vec<u8>>> {
    let mut entries = Vec::new();
    for index in 0..unsafe { (*acl).AceCount } {
        let mut pointer = std::ptr::null_mut();
        if unsafe { GetAce(acl, u32::from(index), &mut pointer) } == 0 {
            return Err(security_error("读取文件访问规则失败"));
        }
        let size = unsafe { (*pointer.cast::<ACE_HEADER>()).AceSize };
        entries.push(unsafe { std::slice::from_raw_parts(pointer.cast::<u8>(), usize::from(size)) }.to_vec());
    }
    Ok(entries)
}
