"""
General Alexandria PDF generator. Converts any markdown file to a branded PDF.
Uses ReportLab with Alexandria brand system (cream, Playfair, EB Garamond, gold).

Usage:
    python scripts/generate_pdf.py <input.md> [output.pdf]
    python scripts/generate_pdf.py files/confidential/Alexandria.md

If output is omitted, replaces .md with .pdf in the same directory.
Generates a .png screenshot of page 1 alongside the PDF for visual verification.
"""

import re
import sys
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    PageBreak, Flowable, NextPageTemplate, Table, TableStyle,
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# --- Paths ---
BASE = Path(__file__).parent.parent
FONT_DIR = BASE / ".font_cache"

# --- Colours (from A3 brand guide) ---
CREAM = HexColor("#faf8f5")
NEAR_BLACK = HexColor("#1a1a1a")
SECONDARY = HexColor("#4d4640")
MUTED = HexColor("#8a8078")
GHOST = HexColor("#bbb4aa")
GOLD = HexColor("#c4956a")

# --- Fonts ---
pdfmetrics.registerFont(TTFont("Playfair", str(FONT_DIR / "PlayfairDisplay-Regular.ttf")))
pdfmetrics.registerFont(TTFont("EBGaramond", str(FONT_DIR / "EBGaramond-Regular.ttf")))
pdfmetrics.registerFont(TTFont("EBGaramond-Bold", str(FONT_DIR / "EBGaramond-Bold.ttf")))
pdfmetrics.registerFont(TTFont("EBGaramond-Italic", str(FONT_DIR / "EBGaramond-Italic.ttf")))
pdfmetrics.registerFont(TTFont("EBGaramond-BoldItalic", str(FONT_DIR / "EBGaramond-BoldItalic.ttf")))

# Register font family so <b>, <i>, <bi> map correctly inside paragraphs.
from reportlab.pdfbase.pdfmetrics import registerFontFamily
registerFontFamily(
    "EBGaramond",
    normal="EBGaramond",
    bold="EBGaramond-Bold",
    italic="EBGaramond-Italic",
    boldItalic="EBGaramond-BoldItalic",
)

# --- Page dimensions (letter, generous margins per A3: "55mm side margins") ---
W, H = letter
MARGIN_LEFT = 1.4 * inch
MARGIN_RIGHT = 1.4 * inch
MARGIN_TOP = 1.3 * inch
MARGIN_BOTTOM = 1.1 * inch
FRAME_W = W - MARGIN_LEFT - MARGIN_RIGHT
FRAME_H = H - MARGIN_TOP - MARGIN_BOTTOM

# --- Styles ---
S_BODY = ParagraphStyle(
    "Body",
    fontName="EBGaramond",
    fontSize=10.5,
    leading=19,
    textColor=SECONDARY,
    alignment=TA_LEFT,
    spaceAfter=10,
)

S_H1 = ParagraphStyle(
    "H1",
    fontName="Playfair",
    fontSize=20,
    leading=26,
    textColor=NEAR_BLACK,
    alignment=TA_LEFT,
    spaceBefore=0,
    spaceAfter=6,
)

S_SUBTITLE = ParagraphStyle(
    "Subtitle",
    fontName="EBGaramond",
    fontSize=11,
    leading=16,
    textColor=MUTED,
    alignment=TA_LEFT,
    spaceBefore=0,
    spaceAfter=20,
)

S_H2 = ParagraphStyle(
    "H2",
    fontName="Playfair",
    fontSize=15,
    leading=21,
    textColor=NEAR_BLACK,
    alignment=TA_LEFT,
    spaceBefore=24,
    spaceAfter=10,
)

S_H3 = ParagraphStyle(
    "H3",
    fontName="EBGaramond-Bold",
    fontSize=11,
    leading=17,
    textColor=NEAR_BLACK,
    alignment=TA_LEFT,
    spaceBefore=16,
    spaceAfter=6,
)

S_BULLET = ParagraphStyle(
    "Bullet",
    fontName="EBGaramond",
    fontSize=10.5,
    leading=18,
    textColor=SECONDARY,
    alignment=TA_LEFT,
    leftIndent=16,
    bulletIndent=0,
    spaceAfter=5,
)

S_NUMBERED = ParagraphStyle(
    "Numbered",
    fontName="EBGaramond",
    fontSize=10.5,
    leading=18,
    textColor=SECONDARY,
    alignment=TA_LEFT,
    leftIndent=20,
    bulletIndent=0,
    spaceAfter=7,
)

S_QUOTE = ParagraphStyle(
    "Quote",
    fontName="EBGaramond",
    fontSize=13,
    leading=22,
    textColor=NEAR_BLACK,
    alignment=TA_LEFT,
    leftIndent=28,
    rightIndent=28,
    spaceBefore=14,
    spaceAfter=16,
)

S_TABLE_HEADER = ParagraphStyle(
    "TableHeader",
    fontName="EBGaramond-Bold",
    fontSize=9.5,
    leading=14,
    textColor=NEAR_BLACK,
)

S_TABLE_CELL = ParagraphStyle(
    "TableCell",
    fontName="EBGaramond",
    fontSize=9.5,
    leading=14,
    textColor=SECONDARY,
)

S_HR = ParagraphStyle(
    "HR",
    fontSize=6,
    leading=6,
    spaceBefore=12,
    spaceAfter=12,
)


# --- Custom flowables ---

class GoldRule(Flowable):
    def __init__(self, width=60, thickness=0.5):
        super().__init__()
        self.rule_width = width
        self.thickness = thickness
        self.width = FRAME_W
        self.height = 0

    def draw(self):
        self.canv.setStrokeColor(GOLD)
        self.canv.setLineWidth(self.thickness)
        x = (self.width - self.rule_width) / 2
        self.canv.line(x, 0, x + self.rule_width, 0)


# --- Page callbacks ---

def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.restoreState()


def body_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFont("EBGaramond", 8)
    canvas.setFillColor(GHOST)
    canvas.drawCentredString(W / 2, MARGIN_BOTTOM - 24, str(doc.page))
    canvas.restoreState()


# --- Markdown parsing ---

def format_inline(text):
    """Convert markdown inline formatting to ReportLab XML."""
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = re.sub(r"\*(.+?)\*", r"<i>\1</i>", text)
    text = re.sub(r"`(.+?)`", r"<font face='EBGaramond' color='#6b6b6b'>\1</font>", text)
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)  # strip links, keep text
    text = text.replace("--", "\u2014")
    return text


def parse_table(lines):
    """Parse markdown table lines into a list of rows (list of cell strings)."""
    rows = []
    for line in lines:
        line = line.strip()
        if line.startswith("|") and not re.match(r"^\|[\s\-\|:]+\|$", line):
            cells = [c.strip() for c in line.split("|")[1:-1]]
            rows.append(cells)
    return rows


def build_table_flowable(rows):
    """Create a ReportLab Table from parsed rows."""
    if not rows:
        return None

    # First row is header
    header = rows[0]
    data_rows = rows[1:]

    table_data = []
    # Header row
    table_data.append([Paragraph(format_inline(c), S_TABLE_HEADER) for c in header])
    # Data rows
    for row in data_rows:
        table_data.append([Paragraph(format_inline(c), S_TABLE_CELL) for c in row])

    num_cols = len(header)
    col_width = FRAME_W / num_cols
    col_widths = [col_width] * num_cols

    t = Table(table_data, colWidths=col_widths)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), HexColor("#f0ece6")),
        ("TEXTCOLOR", (0, 0), (-1, -1), SECONDARY),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("LINEBELOW", (0, 0), (-1, 0), 0.5, GOLD),
        ("LINEBELOW", (0, 1), (-1, -1), 0.25, HexColor("#e0dbd4")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    return t


def parse_md(path):
    """Parse markdown into flowables."""
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    story = []

    i = 0
    title_found = False
    subtitle_lines = []
    in_table = False
    table_lines = []

    while i < len(lines):
        line = lines[i]
        stripped = line.strip()

        # Table detection
        if stripped.startswith("|") and "|" in stripped[1:]:
            if not in_table:
                in_table = True
                table_lines = []
            table_lines.append(stripped)
            i += 1
            continue
        elif in_table:
            # End of table
            rows = parse_table(table_lines)
            t = build_table_flowable(rows)
            if t:
                story.append(Spacer(1, 8))
                story.append(t)
                story.append(Spacer(1, 8))
            in_table = False
            table_lines = []
            # Don't increment i — process current line

        # H1
        if stripped.startswith("# ") and not stripped.startswith("## "):
            if not title_found:
                title_text = stripped[2:].strip()
                story.append(Paragraph(format_inline(title_text), S_H1))
                title_found = True
            i += 1
            continue

        # Bold subtitle line right after title (like **Cognitive transformation....**)
        if title_found and len(story) <= 2 and stripped.startswith("**") and stripped.endswith("**"):
            subtitle_text = stripped[2:-2]
            story.append(Paragraph(format_inline(subtitle_text), S_SUBTITLE))
            i += 1
            continue

        # HR
        if stripped == "---":
            story.append(Spacer(1, 6))
            story.append(GoldRule())
            story.append(Spacer(1, 6))
            i += 1
            continue

        # H2
        if stripped.startswith("## "):
            title = stripped[3:].strip()
            story.append(Paragraph(format_inline(title), S_H2))
            i += 1
            continue

        # H3
        if stripped.startswith("### "):
            title = stripped[4:].strip()
            story.append(Paragraph(format_inline(title), S_H3))
            i += 1
            continue

        # Bullet
        if stripped.startswith("- ") or stripped.startswith("* "):
            bullet_text = stripped[2:].strip()
            story.append(Paragraph(
                f"\u2022  {format_inline(bullet_text)}", S_BULLET
            ))
            i += 1
            continue

        # Numbered list (1. text, 2. text, ...)
        m_num = re.match(r"^(\d+)\.\s+(.+)$", stripped)
        if m_num:
            num, item_text = m_num.group(1), m_num.group(2)
            story.append(Paragraph(
                f"<b>{num}.</b>  {format_inline(item_text)}", S_NUMBERED
            ))
            i += 1
            continue

        # Blockquote
        if stripped.startswith("> "):
            quote_text = stripped[2:].strip()
            story.append(Paragraph(format_inline(quote_text), S_QUOTE))
            i += 1
            continue

        # Bold label line (like **Layer 1 — ...**)
        if stripped.startswith("**") and "**" in stripped[2:]:
            story.append(Paragraph(format_inline(stripped), S_BODY))
            i += 1
            continue

        # Empty line
        if not stripped:
            i += 1
            continue

        # Regular paragraph — accumulate consecutive non-empty lines
        para_lines = [stripped]
        while i + 1 < len(lines) and lines[i + 1].strip() and not lines[i + 1].strip().startswith(("#", "-", "*", "|", "---")):
            i += 1
            para_lines.append(lines[i].strip())

        para_text = " ".join(para_lines)
        story.append(Paragraph(format_inline(para_text), S_BODY))
        i += 1

    # Flush remaining table
    if in_table and table_lines:
        rows = parse_table(table_lines)
        t = build_table_flowable(rows)
        if t:
            story.append(t)

    return story


# --- Build PDF ---

def build_pdf(md_path, pdf_path):
    doc = BaseDocTemplate(
        str(pdf_path),
        pagesize=letter,
        leftMargin=MARGIN_LEFT,
        rightMargin=MARGIN_RIGHT,
        topMargin=MARGIN_TOP,
        bottomMargin=MARGIN_BOTTOM,
        title=md_path.stem.lower(),
        author="Benjamin A. Mowinckel",
    )

    cover_frame = Frame(MARGIN_LEFT, MARGIN_BOTTOM, FRAME_W, FRAME_H, id="cover")
    body_frame = Frame(MARGIN_LEFT, MARGIN_BOTTOM, FRAME_W, FRAME_H, id="body")

    # Compact mode (memo): no dedicated cover or hook pages — body template throughout
    doc_name_early = md_path.stem.lower()
    is_compact = doc_name_early == "memo"

    if is_compact:
        doc.addPageTemplates([
            PageTemplate(id="body", frames=[body_frame], onPage=body_page),
            PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page),
        ])
    else:
        doc.addPageTemplates([
            PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page),
            PageTemplate(id="body", frames=[body_frame], onPage=body_page),
        ])

    story = []

    # Cover page content
    flowables = parse_md(md_path)

    # Extract title, subtitle, opening paragraphs (pre-H2), and body (H2+)
    opening_items = []  # paragraphs before first H2 — the hook
    body_items = []     # everything from first H2 onward
    title_text = ""
    subtitle_text = ""
    found_first_h2 = False

    for f in flowables:
        # Detect H1 (title)
        if hasattr(f, 'style') and getattr(f.style, 'name', '') == 'H1' and not title_text:
            title_text = f.text if hasattr(f, 'text') else str(f)
            continue
        # Detect subtitle
        if hasattr(f, 'style') and getattr(f.style, 'name', '') == 'Subtitle' and not subtitle_text:
            subtitle_text = f.text if hasattr(f, 'text') else str(f)
            continue
        # Split at first H2
        if hasattr(f, 'style') and getattr(f.style, 'name', '') == 'H2':
            found_first_h2 = True
        if not found_first_h2:
            style_name = getattr(f.style, 'name', '') if hasattr(f, 'style') else ''
            if style_name in ('Body', 'Bullet', 'Numbered', 'Quote'):
                opening_items.append(f)
            continue
        body_items.append(f)

    # If nothing was split, everything goes to body
    if not body_items:
        body_items = flowables

    # Derive document name from filename
    doc_name = md_path.stem.lower()
    if doc_name == "alexandria":
        cover_title = "alexandria."
        cover_subtitle = "Greek philosophy infrastructure"
    elif doc_name == "memo":
        cover_title = "alexandria."
        cover_subtitle = "investment memo"
    elif doc_name == "brief":
        cover_title = "alexandria."
        cover_subtitle = "investor brief"
    elif doc_name == "vision":
        cover_title = "alexandria."
        cover_subtitle = "the vision"
    else:
        cover_title = doc_name + "."
        cover_subtitle = ""

    # Build cover — centred, elegant, branded
    S_COVER_TITLE = ParagraphStyle(
        "CoverTitle", fontName="Playfair", fontSize=22,
        leading=28, textColor=NEAR_BLACK, alignment=TA_CENTER,
    )
    S_COVER_SUB = ParagraphStyle(
        "CoverSub", fontName="EBGaramond", fontSize=12,
        leading=18, textColor=MUTED, alignment=TA_CENTER,
    )
    S_COVER_META = ParagraphStyle(
        "CoverMeta", fontName="EBGaramond", fontSize=9,
        leading=14, textColor=GHOST, alignment=TA_CENTER,
    )
    S_COVER_CONF = ParagraphStyle(
        "CoverConf", fontName="EBGaramond", fontSize=8.5,
        leading=12, textColor=GHOST, alignment=TA_CENTER,
    )

    if is_compact:
        # Compact branded header at top of page 1 \u2014 no dedicated cover, no hook page
        S_COMPACT_TITLE = ParagraphStyle(
            "CompactTitle", fontName="Playfair", fontSize=16,
            leading=20, textColor=NEAR_BLACK, alignment=TA_LEFT,
            spaceAfter=2,
        )
        S_COMPACT_SUB = ParagraphStyle(
            "CompactSub", fontName="EBGaramond", fontSize=10,
            leading=14, textColor=MUTED, alignment=TA_LEFT,
            spaceAfter=8,
        )
        story.append(Paragraph(cover_title, S_COMPACT_TITLE))
        if cover_subtitle:
            story.append(Paragraph(cover_subtitle, S_COMPACT_SUB))
        story.append(GoldRule(width=80))
        story.append(Spacer(1, 14))

        # Inline opening hook quotes (no page break)
        for item in opening_items:
            story.append(item)
        if opening_items:
            story.append(Spacer(1, 8))

        for item in body_items:
            story.append(item)
    else:
        # Build cover \u2014 centred, elegant, branded
        story.append(Spacer(1, FRAME_H * 0.32))
        story.append(Paragraph(cover_title, S_COVER_TITLE))
        story.append(Spacer(1, 10))
        if cover_subtitle:
            story.append(Paragraph(cover_subtitle, S_COVER_SUB))
        story.append(Spacer(1, 24))
        story.append(GoldRule())
        story.append(Spacer(1, 20))
        story.append(Paragraph("Benjamin A. Mowinckel  \u2014  March 2026", S_COVER_META))

        # Add confidential notice if applicable
        is_confidential = "confidential" in str(md_path).lower()
        if is_confidential:
            story.append(Spacer(1, 40))
            story.append(Paragraph("Confidential. Not for distribution.", S_COVER_CONF))

        # Add subtitle/tagline if found
        if subtitle_text:
            story.append(Spacer(1, 30))
            story.append(Paragraph(f"<i>{subtitle_text}</i>", S_COVER_SUB))

        # Transition to body
        story.append(NextPageTemplate("body"))
        story.append(PageBreak())

        # Opening paragraphs (pre-H2 hook) get their own page with breathing room
        if opening_items:
            story.append(Spacer(1, FRAME_H * 0.08))
            for item in opening_items:
                story.append(item)
            story.append(PageBreak())

        for item in body_items:
            story.append(item)

    doc.build(story)
    print(f"Generated: {pdf_path} ({pdf_path.stat().st_size // 1024}KB)")


def generate_preview(pdf_path):
    """Generate PNG previews using Chrome headless (available on this system)."""
    import subprocess
    import json
    chrome = r"C:\Program Files\Google\Chrome\Application\chrome.exe"

    # Create a minimal HTML that embeds the PDF for screenshotting
    # Instead, render the PDF pages as images using fitz (PyMuPDF) if available
    try:
        import fitz  # PyMuPDF
        doc = fitz.open(str(pdf_path))
        for i, page in enumerate(doc):
            if i >= 3:
                break
            pix = page.get_pixmap(dpi=150)
            preview_path = pdf_path.with_suffix(f".preview_p{i+1}.png")
            pix.save(str(preview_path))
            print(f"Preview: {preview_path}")
        doc.close()
    except ImportError:
        print("PyMuPDF not available. Install with: pip install PyMuPDF")
        print("This enables PNG preview generation for visual verification.")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python scripts/generate_pdf.py <input.md> [output.pdf]")
        sys.exit(1)

    md_path = Path(sys.argv[1])
    if not md_path.exists():
        print(f"Not found: {md_path}")
        sys.exit(1)

    if len(sys.argv) >= 3:
        pdf_path = Path(sys.argv[2])
    else:
        pdf_path = md_path.with_suffix(".pdf")

    build_pdf(md_path, pdf_path)
    generate_preview(pdf_path)
