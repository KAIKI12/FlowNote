---
title: FlowNote Unsupported Syntax Test
tags:
  - qualification
  - markdown
---

# Unsupported / Extended Syntax

## WikiLink

[[Useful Skew]]

## Footnote

Timing closure may require multiple iterations.[^1]

[^1]: This footnote must not silently disappear.

## Raw HTML

<span style="color:red">This is ordinary Markdown raw HTML.</span>

<div class="custom-box">
Raw block HTML inside Markdown.
</div>

## Unknown fence

```my-custom-language
alpha = beta
do_not_delete_this
```

## Mermaid source

```mermaid
flowchart LR
    Place --> CTS --> Route --> ECO
```

## LaTeX source

Inline math source: $WNS = T_{required} - T_{arrival}$

Block:

$$
P_{dyn} = \alpha C V^2 f
$$

## Custom directive-like syntax

:::warning
This custom directive must not silently disappear.
:::
