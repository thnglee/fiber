#!/usr/bin/env python3
"""Convert outline-updated.md → outline-updated.pdf with formatting similar to the original PDF."""

import subprocess, sys, pathlib

MD_PATH = pathlib.Path(__file__).parent / "outline-updated.md"
PDF_PATH = pathlib.Path(__file__).parent / "outline-updated.pdf"

md_text = MD_PATH.read_text(encoding="utf-8")

# ── CSS ──────────────────────────────────────────────────────────────────────
CSS = """
@import url('https://fonts.googleapis.com/css2?family=Times+New+Roman:ital,wght@0,400;0,700;1,400&display=swap');

@page {
    size: A4;
    margin: 2.5cm 2.5cm 2.5cm 3cm;
    @top-center { content: ""; }
    @bottom-center {
        content: counter(page);
        font-family: "Times New Roman", Times, serif;
        font-size: 11pt;
    }
}

body {
    font-family: "Times New Roman", Times, serif;
    font-size: 13pt;
    line-height: 1.6;
    color: #000;
    text-align: justify;
    hyphens: auto;
    -webkit-hyphens: auto;
}

/* ── Cover info block ── */
.cover-block {
    text-align: center;
    margin-bottom: 28pt;
    padding-bottom: 12pt;
    border-bottom: 1.5pt solid #000;
}
.cover-title {
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
    margin-bottom: 6pt;
}
.cover-meta {
    font-size: 12pt;
    line-height: 1.8;
}

/* ── Headings ── */
h1 {
    font-size: 14pt;
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
    margin-top: 24pt;
    margin-bottom: 10pt;
    border-bottom: 1pt solid #000;
    padding-bottom: 4pt;
}

h2 {
    font-size: 13pt;
    font-weight: bold;
    text-transform: uppercase;
    margin-top: 18pt;
    margin-bottom: 8pt;
}

h3 {
    font-size: 13pt;
    font-weight: bold;
    margin-top: 12pt;
    margin-bottom: 6pt;
}

/* ── Lists ── */
ul, ol {
    margin: 4pt 0 4pt 0;
    padding-left: 24pt;
}
li {
    margin-bottom: 3pt;
    line-height: 1.5;
}

/* ── Horizontal rule ── */
hr {
    border: none;
    border-top: 0.8pt solid #555;
    margin: 14pt 0;
}

/* ── Strong / emphasis ── */
strong { font-weight: bold; }
em     { font-style: italic; }

/* ── Table of contents section ── */
.toc-line {
    font-size: 12pt;
    color: #333;
}

/* ── References ── */
.references p {
    text-indent: -24pt;
    padding-left: 24pt;
    margin-bottom: 5pt;
    font-size: 12pt;
}

/* ── Paragraph spacing ── */
p {
    margin-top: 4pt;
    margin-bottom: 4pt;
}

/* ── Page break helpers ── */
.page-break { page-break-after: always; }
"""

# ── Build HTML from markdown ─────────────────────────────────────────────────
import re, html as html_mod

def md_to_html_custom(md: str) -> str:
    """Simple but sufficient custom MD → HTML converter (no external libs needed)."""
    lines = md.split("\n")
    html_parts = []
    i = 0
    in_list = False
    in_ol = False
    in_refs = False

    def flush_list():
        nonlocal in_list, in_ol
        if in_list:
            html_parts.append("</ul>")
            in_list = False
        if in_ol:
            html_parts.append("</ol>")
            in_ol = False

    def inline(s: str) -> str:
        """Apply inline markdown: bold, italic, code."""
        # bold+italic
        s = re.sub(r'\*\*\*(.+?)\*\*\*', r'<strong><em>\1</em></strong>', s)
        # bold
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        # italic
        s = re.sub(r'\*(.+?)\*', r'<em>\1</em>', s)
        # backtick code
        s = re.sub(r'`([^`]+)`', r'<code>\1</code>', s)
        return s

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # ATX headings
        if stripped.startswith("######"):
            flush_list()
            html_parts.append(f"<h6>{inline(stripped[6:].strip())}</h6>")
        elif stripped.startswith("#####"):
            flush_list()
            html_parts.append(f"<h5>{inline(stripped[5:].strip())}</h5>")
        elif stripped.startswith("####"):
            flush_list()
            html_parts.append(f"<h4>{inline(stripped[4:].strip())}</h4>")
        elif stripped.startswith("###"):
            flush_list()
            html_parts.append(f"<h3>{inline(stripped[3:].strip())}</h3>")
        elif stripped.startswith("##"):
            flush_list()
            html_parts.append(f"<h2>{inline(stripped[2:].strip())}</h2>")
        elif stripped.startswith("#"):
            flush_list()
            html_parts.append(f"<h1>{inline(stripped[1:].strip())}</h1>")

        # Horizontal rule
        elif stripped in ("---", "***", "___"):
            flush_list()
            html_parts.append("<hr>")

        # Ordered list
        elif re.match(r'^\d+\.\s', stripped):
            if not in_ol:
                flush_list()
                html_parts.append("<ol>")
                in_ol = True
            content = re.sub(r'^\d+\.\s+', '', stripped)
            html_parts.append(f"<li>{inline(content)}</li>")

        # Unordered list
        elif stripped.startswith("- ") or stripped.startswith("* "):
            if not in_list:
                flush_list()
                html_parts.append("<ul>")
                in_list = True
            content = stripped[2:]
            html_parts.append(f"<li>{inline(content)}</li>")

        # Blank line
        elif stripped == "":
            flush_list()
            html_parts.append("")

        # Paragraph
        else:
            flush_list()
            html_parts.append(f"<p>{inline(stripped)}</p>")

        i += 1

    flush_list()
    return "\n".join(html_parts)

body_html = md_to_html_custom(md_text)

# ── Extract cover metadata and inject styled block ───────────────────────────
def build_cover_block(md: str) -> str:
    """Extract the top metadata lines and format them as a cover block."""
    title_m = re.search(r'\*\*Đề tài:\*\*\s*(.+)', md)
    sv_m    = re.search(r'\*\*Sinh viên:\*\*\s*(.+)', md)
    cb_m    = re.search(r'\*\*Cán bộ hướng dẫn:\*\*\s*(.+)', md)
    upd_m   = re.search(r'\*\*Cập nhật:\*\*\s*(.+)', md)

    title = title_m.group(1).strip() if title_m else ""
    sv    = sv_m.group(1).strip() if sv_m else ""
    cb    = cb_m.group(1).strip() if cb_m else ""
    upd   = upd_m.group(1).strip() if upd_m else ""

    return f"""
<div class="cover-block">
  <div class="cover-title">OUTLINE KHÓA LUẬN TỐT NGHIỆP</div>
  <div class="cover-meta">
    <strong>Đề tài:</strong> {html_mod.escape(title)}<br>
    <strong>Sinh viên:</strong> {html_mod.escape(sv)}<br>
    <strong>Cán bộ hướng dẫn:</strong> {html_mod.escape(cb)}<br>
    <strong>Cập nhật:</strong> {html_mod.escape(upd)}
  </div>
</div>
"""

cover_html = build_cover_block(md_text)

# Remove the first h1 (already shown in cover) and the meta lines that follow
body_html = re.sub(r'<h1>OUTLINE KHÓA LUẬN TỐT NGHIỆP.*?</h1>', '', body_html, flags=re.IGNORECASE)
# Remove cover metadata paragraphs
for pat in [r'<p><strong>Đề tài:</strong>.*?</p>',
            r'<p><strong>Sinh viên:</strong>.*?</p>',
            r'<p><strong>Cán bộ hướng dẫn:</strong>.*?</p>',
            r'<p><strong>Cập nhật:</strong>.*?</p>']:
    body_html = re.sub(pat, '', body_html, flags=re.DOTALL)

full_html = f"""<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<title>Outline Khóa Luận Tốt Nghiệp – Lê Văn Thắng</title>
<style>
{CSS}
</style>
</head>
<body>
{cover_html}
{body_html}
</body>
</html>
"""

# Write intermediate HTML (useful for debugging)
html_path = PDF_PATH.with_suffix(".html")
html_path.write_text(full_html, encoding="utf-8")
print(f"HTML written → {html_path}")

# ── Generate PDF with WeasyPrint ─────────────────────────────────────────────
from weasyprint import HTML as WH, CSS as WCSS

print("Generating PDF …")
WH(filename=str(html_path)).write_pdf(
    str(PDF_PATH),
    stylesheets=[WCSS(string=CSS)],
    presentational_hints=True,
)
print(f"PDF saved → {PDF_PATH}")
