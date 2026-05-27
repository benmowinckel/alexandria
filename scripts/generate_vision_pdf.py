"""
Generate Vision.pdf from Vision.md with composed spatial layout.
Uses ReportLab. Fonts from ../.font_cache/.

Run from repo root:
    python scripts/generate_vision_pdf.py

Pipeline: Vision.md changes -> run this -> PDF updates.
"""

import re
from pathlib import Path
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, Paragraph, Spacer,
    PageBreak, Flowable, NextPageTemplate
)
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT, TA_CENTER

# --- Paths ---
BASE = Path(__file__).parent.parent
FONT_DIR = BASE / ".font_cache"
MD_PATH = BASE / "files" / "public" / "Vision.md"
PDF_PATH = BASE / "files" / "public" / "Vision.pdf"

# --- Colours ---
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
pdfmetrics.registerFont(TTFont("EBGaramond-BoldItalic", str(FONT_DIR / "EBGaramond-BoldItalic.ttf")))

# --- Page dimensions ---
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
    spaceAfter=12,
)

S_SECTION_NUM = ParagraphStyle(
    "SectionNum",
    fontName="EBGaramond",
    fontSize=9,
    leading=12,
    textColor=GHOST,
    alignment=TA_LEFT,
    spaceBefore=0,
    spaceAfter=4,
)

S_SECTION_TITLE = ParagraphStyle(
    "SectionTitle",
    fontName="Playfair",
    fontSize=16,
    leading=22,
    textColor=NEAR_BLACK,
    alignment=TA_LEFT,
    spaceBefore=0,
    spaceAfter=24,
)

S_PULL = ParagraphStyle(
    "Pull",
    fontName="EBGaramond",
    fontSize=13,
    leading=22,
    textColor=NEAR_BLACK,
    alignment=TA_CENTER,
    spaceBefore=20,
    spaceAfter=20,
)

S_PULL_SMALL = ParagraphStyle(
    "PullSmall",
    fontName="EBGaramond",
    fontSize=11,
    leading=19,
    textColor=MUTED,
    alignment=TA_CENTER,
    spaceBefore=14,
    spaceAfter=14,
)

S_CTA = ParagraphStyle(
    "CTA",
    fontName="Playfair",
    fontSize=11,
    leading=18,
    textColor=NEAR_BLACK,
    alignment=TA_CENTER,
    spaceBefore=8,
    spaceAfter=4,
)

S_CTA_LINK = ParagraphStyle(
    "CTALink",
    fontName="EBGaramond",
    fontSize=9.5,
    leading=14,
    textColor=MUTED,
    alignment=TA_CENTER,
    spaceBefore=4,
    spaceAfter=0,
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


class DotDivider(Flowable):
    def __init__(self):
        super().__init__()
        self.width = FRAME_W
        self.height = 6

    def draw(self):
        self.canv.setFillColor(MUTED)
        self.canv.setFont("EBGaramond", 8)
        cx = self.width / 2
        self.canv.drawCentredString(cx, 0, "\u00b7     \u00b7     \u00b7")


# --- Pull quotes to extract from body text and render as composed elements ---
PULL_QUOTES = {
    "Humans value humans.": {"style": "large"},
    "Authenticity escapes competition.": {"style": "large"},
    "The product is the vehicle. The philosophy is the thing.": {"style": "large"},
}

DECAY_PULL = "But if your mind gets weak, the thing that would decide to fix it is the thing that got weak."

# Closing CTA lines stripped from last section (closing page handles them)
CLOSING_STRIPS = {
    "Freedom. Authenticity. Purpose. Own it, develop it, use it.",
    "Five minutes. Five dollars. Start now.",
    "alexandria-library.com/join",
}


# --- Page callbacks ---

def cover_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)

    y_title = H * 0.62
    canvas.setFont("Playfair", 22)
    canvas.setFillColor(NEAR_BLACK)
    canvas.drawCentredString(W / 2, y_title, "alexandria.")

    canvas.setFont("EBGaramond", 12)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(W / 2, y_title - 34, "the vision")

    canvas.setStrokeColor(GOLD)
    canvas.setLineWidth(0.5)
    rx = 40
    canvas.line(W / 2 - rx, y_title - 56, W / 2 + rx, y_title - 56)

    canvas.setFont("EBGaramond", 9)
    canvas.setFillColor(GHOST)
    canvas.drawCentredString(W / 2, y_title - 78, "Benjamin a. Mowinckel  \u2014  March 2026")

    y_sub = y_title - 120
    canvas.setFont("EBGaramond", 9.5)
    canvas.setFillColor(MUTED)
    canvas.drawCentredString(W / 2, y_sub, "The full philosophy in plain English.")
    canvas.drawCentredString(W / 2, y_sub - 16, "Just the argument, clearly explained,")
    canvas.drawCentredString(W / 2, y_sub - 32, "for someone who wants to understand everything.")

    canvas.restoreState()


def body_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.setFont("EBGaramond", 8)
    canvas.setFillColor(GHOST)
    canvas.drawCentredString(W / 2, MARGIN_BOTTOM - 24, str(doc.page))
    canvas.restoreState()


def closing_page(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(CREAM)
    canvas.rect(0, 0, W, H, fill=1, stroke=0)
    canvas.restoreState()


# --- Parse Vision.md ---

def parse_md(path):
    text = path.read_text(encoding="utf-8")
    text = re.sub(r"^# Alexandria.*?\n", "", text)
    text = re.sub(r"^\*.*?\*\n", "", text.strip())
    text = re.sub(r"^---\n", "", text.strip())
    text = text.strip()

    sections = []
    current_title = None
    current_paras = []

    for line in text.split("\n"):
        line = line.rstrip()
        if line.startswith("## "):
            if current_title is not None:
                sections.append((current_title, current_paras))
            current_title = line[3:].strip()
            current_paras = []
        elif line.strip():
            current_paras.append(line)
        elif current_paras and current_paras[-1] != "":
            current_paras.append("")

    if current_title is not None:
        sections.append((current_title, current_paras))

    return sections


def paras_from_lines(lines):
    paragraphs = []
    current = []
    for line in lines:
        if line == "":
            if current:
                paragraphs.append(" ".join(current))
                current = []
        else:
            current.append(line)
    if current:
        paragraphs.append(" ".join(current))
    return paragraphs


def format_body_text(text):
    text = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", text)
    text = text.replace("--", "\u2014")
    text = text.replace(" \u2014 ", " \u2014 ")
    return text


# --- Build flowables ---

def build_flowables(sections):
    story = []

    story.append(NextPageTemplate("body"))
    story.append(PageBreak())

    roman = ["i", "ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "x"]

    for idx, (title, lines) in enumerate(sections):
        paragraphs = paras_from_lines(lines)

        # Strip closing CTA from last section
        if idx == len(sections) - 1:
            paragraphs = [p for p in paragraphs if p.strip() not in CLOSING_STRIPS]

        # Divider at top of section (except first)
        if idx > 0:
            story.append(DotDivider())
            story.append(Spacer(1, 20))

        # Section number
        if idx < len(roman):
            story.append(Paragraph(f"{roman[idx]}.", S_SECTION_NUM))

        # Section title
        display_title = title.lower().rstrip(".") + "."
        story.append(Paragraph(display_title, S_SECTION_TITLE))

        for para_text in paragraphs:
            formatted = format_body_text(para_text)
            pull_found = False

            # Decay pull quote — special line break treatment
            if DECAY_PULL in para_text:
                before = para_text[:para_text.index(DECAY_PULL)].strip()
                after = para_text[para_text.index(DECAY_PULL) + len(DECAY_PULL):].strip()

                if before:
                    story.append(Paragraph(format_body_text(before), S_BODY))

                story.append(Spacer(1, 16))
                pull_text = ("But if your mind gets weak,<br/>"
                             "the thing that would decide to fix it<br/>"
                             "is the thing that got weak.")
                story.append(Paragraph(f"<i>{pull_text}</i>", S_PULL))
                story.append(Spacer(1, 16))

                if after:
                    story.append(Paragraph(format_body_text(after), S_BODY))
                pull_found = True

            # Standard pull quotes
            if not pull_found:
                for quote, opts in PULL_QUOTES.items():
                    if quote in para_text:
                        before = para_text[:para_text.index(quote)].strip()
                        after = para_text[para_text.index(quote) + len(quote):].strip()

                        if before:
                            story.append(Paragraph(format_body_text(before), S_BODY))

                        story.append(Spacer(1, 12))
                        style = S_PULL if opts["style"] == "large" else S_PULL_SMALL
                        story.append(Paragraph(f"<i>{format_body_text(quote)}</i>", style))
                        story.append(Spacer(1, 12))

                        if after:
                            story.append(Paragraph(format_body_text(after), S_BODY))

                        pull_found = True
                        break

            if not pull_found:
                story.append(Paragraph(formatted, S_BODY))

        # Page break after each section (except last)
        if idx < len(sections) - 1:
            story.append(PageBreak())

    # --- Closing page ---
    story.append(NextPageTemplate("closing"))
    story.append(PageBreak())

    story.append(Spacer(1, FRAME_H * 0.3))

    story.append(Paragraph("<i>Freedom. Authenticity. Purpose.</i>", S_PULL))

    story.append(Spacer(1, 28))
    story.append(GoldRule(width=40, thickness=0.4))
    story.append(Spacer(1, 28))

    story.append(Paragraph("Five minutes. Five dollars. Start now.", S_CTA))
    story.append(Spacer(1, 12))
    story.append(Paragraph(
        '<link href="https://alexandria-library.com/join" color="#8a8078">alexandria-library.com/join</link>',
        S_CTA_LINK
    ))

    story.append(Spacer(1, 48))

    story.append(Paragraph("a.", ParagraphStyle(
        "Mark",
        fontName="Playfair",
        fontSize=14,
        textColor=NEAR_BLACK,
        alignment=TA_CENTER,
    )))

    return story


# --- Build PDF ---

def build_pdf():
    sections = parse_md(MD_PATH)

    doc = BaseDocTemplate(
        str(PDF_PATH),
        pagesize=letter,
        title="Alexandria \u2014 The Vision",
        author="Benjamin a. Mowinckel",
    )

    cover_frame = Frame(MARGIN_LEFT, MARGIN_BOTTOM, FRAME_W, FRAME_H, id="cover")
    body_frame = Frame(MARGIN_LEFT, MARGIN_BOTTOM, FRAME_W, FRAME_H, id="body")
    closing_frame = Frame(MARGIN_LEFT, MARGIN_BOTTOM, FRAME_W, FRAME_H, id="closing")

    doc.addPageTemplates([
        PageTemplate(id="cover", frames=[cover_frame], onPage=cover_page),
        PageTemplate(id="body", frames=[body_frame], onPage=body_page),
        PageTemplate(id="closing", frames=[closing_frame], onPage=closing_page),
    ])

    story = build_flowables(sections)
    doc.build(story)
    print(f"Generated: {PDF_PATH}")
    print(f"  {len(sections)} sections")


if __name__ == "__main__":
    build_pdf()
