package de.is2.insign.gettingstarted;

import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;

import java.io.*;
import java.nio.file.*;

/**
 * Generates beautifully branded test PDF contracts for each logo set / color scheme
 * in the inSign API Explorer. Each brand gets a unique contract type matching its
 * business identity, with decorative backgrounds, branded headers, and professional layouts.
 *
 * Usage: run main() — outputs go to docs/data/
 */
public class BrandedPdfGenerator {

    // --- Fonts ---
    private static final PDType1Font HELVETICA = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDType1Font HELVETICA_BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
    private static final PDType1Font HELVETICA_OBLIQUE = new PDType1Font(Standard14Fonts.FontName.HELVETICA_OBLIQUE);
    private static final PDType1Font TIMES_ROMAN = new PDType1Font(Standard14Fonts.FontName.TIMES_ROMAN);
    private static final PDType1Font TIMES_BOLD = new PDType1Font(Standard14Fonts.FontName.TIMES_BOLD);
    private static final PDType1Font TIMES_ITALIC = new PDType1Font(Standard14Fonts.FontName.TIMES_ITALIC);
    private static final PDType1Font COURIER = new PDType1Font(Standard14Fonts.FontName.COURIER);

    // --- Page geometry ---
    private static final float PW = PDRectangle.A4.getWidth();
    private static final float PH = PDRectangle.A4.getHeight();
    private static final float ML = 55;
    private static final float MR = 55;
    private static final float CW = PW - ML - MR;
    private static final float LH = 14;

    private static final String OUTPUT_DIR = "docs/data";

    // =========================================================================
    // Brand definitions
    // =========================================================================

    static class Brand {
        String key, name, subtitle;
        float[] primary, accent, dark;
        String contractTitle, contractSubtitle, contractNo;
        String[] parties;         // role names for signatures
        String[] partyLabels;     // display names
        String[] partyNames;      // fictitious person names
        String[] partyCompanies;  // company names (optional)
        String[] partyEmails;
        String[] sections;        // section titles
        String[][] sectionText;   // paragraphs per section
        boolean useSigTags;

        Brand(String key) { this.key = key; }
    }

    // =========================================================================

    public static void main(String[] args) throws Exception {
        Path outDir = Paths.get(OUTPUT_DIR);
        Files.createDirectories(outDir);

        Brand[] brands = createAllBrands();

        for (Brand b : brands) {
            b.useSigTags = true;
            String tagFile = outDir.resolve(b.key + "-sigtags.pdf").toString();
            generateBrandedPdf(b, tagFile);

            b.useSigTags = false;
            String fieldFile = outDir.resolve(b.key + "-sigfields.pdf").toString();
            generateBrandedPdf(b, fieldFile);
        }

        System.out.println("\nAll branded PDFs generated in " + outDir.toAbsolutePath());
    }

    // =========================================================================
    // PDF generation
    // =========================================================================

    private static void generateBrandedPdf(Brand b, String outputPath) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDDocumentInformation info = doc.getDocumentInformation();
            info.setTitle(b.contractTitle);
            info.setAuthor(b.name);
            info.setSubject(b.contractSubtitle);
            info.setCreator("inSign Getting Started — Branded PDF Generator");

            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);

            float y;

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {

                // === DECORATIVE BACKGROUND ===
                drawBackground(cs, b);

                // === BRANDED HEADER BAR ===
                y = PH - 28;
                y = drawBrandedHeader(cs, b, y);

                // === CONTRACT TITLE ===
                y -= 18;
                y = drawContractTitle(cs, b, y);

                // === PARTIES SECTION ===
                y -= 8;
                y = drawPartiesSection(cs, b, y);

                // === CONTENT SECTIONS ===
                for (int i = 0; i < b.sections.length; i++) {
                    y -= 6;
                    y = drawDecoLine(cs, b, y);
                    y -= 8;
                    y = drawSectionHeading(cs, b, i + 2, b.sections[i], y);
                    y -= 3;
                    for (String para : b.sectionText[i]) {
                        y = drawParagraph(cs, para, y, 9);
                        y -= 4;
                    }
                }

                // === SIGNATURE SECTION ===
                y -= 6;
                y = drawDecoLine(cs, b, y);
                y -= 8;
                y = drawSignatureSection(cs, b, y);

                // === FOOTER ===
                drawFooter(cs, b);

            } // content stream closed

            // AcroForm signature fields (sigfields variant only)
            if (!b.useSigTags) {
                addSignatureFields(doc, page, b);
            }

            doc.save(outputPath);
            File f = new File(outputPath);
            System.out.printf("  %-50s  (%,d bytes)%n", outputPath, f.length());
        }
    }

    // =========================================================================
    // Decorative background
    // =========================================================================

    private static void drawBackground(PDPageContentStream cs, Brand b) throws IOException {
        // --- Subtle gradient-like vertical stripes (fading from edge) ---
        float[] tint = b.accent;
        // Top corner wash — diagonal fade
        for (int i = 0; i < 30; i++) {
            float alpha = 0.025f - i * 0.0008f;
            if (alpha <= 0) break;
            cs.setNonStrokingColor(tint[0] * alpha + (1 - alpha),
                    tint[1] * alpha + (1 - alpha),
                    tint[2] * alpha + (1 - alpha));
            float w = PW - i * 20;
            float h = 80 - i * 2.5f;
            if (w > 0 && h > 0) {
                cs.addRect(0, PH - h, w, h);
                cs.fill();
            }
        }

        // Bottom accent strip
        cs.setNonStrokingColor(b.primary[0], b.primary[1], b.primary[2]);
        cs.addRect(0, 0, PW, 3);
        cs.fill();

        // Left accent margin line
        cs.setStrokingColor(b.accent[0], b.accent[1], b.accent[2]);
        cs.setLineWidth(1.5f);
        cs.moveTo(ML - 12, PH - 75);
        cs.lineTo(ML - 12, 40);
        cs.stroke();

        // Decorative corner dots (top-right)
        for (int r = 0; r < 4; r++) {
            for (int c = 0; c < 4; c++) {
                float dotAlpha = 0.08f - (r + c) * 0.008f;
                if (dotAlpha <= 0) continue;
                cs.setNonStrokingColor(
                        b.primary[0] * dotAlpha + (1 - dotAlpha),
                        b.primary[1] * dotAlpha + (1 - dotAlpha),
                        b.primary[2] * dotAlpha + (1 - dotAlpha));
                float cx = PW - 30 - c * 12;
                float cy = PH - 90 - r * 12;
                drawCircle(cs, cx, cy, 2);
            }
        }

        // Watermark-style large letter in background
        cs.setNonStrokingColor(b.primary[0] * 0.04f + 0.96f,
                b.primary[1] * 0.04f + 0.96f,
                b.primary[2] * 0.04f + 0.96f);
        cs.beginText();
        cs.setFont(HELVETICA_BOLD, 280);
        cs.newLineAtOffset(PW - 240, PH / 2 - 80);
        cs.showText(b.name.substring(0, 1));
        cs.endText();

        // Reset
        cs.setNonStrokingColor(0, 0, 0);
        cs.setStrokingColor(0, 0, 0);
        cs.setLineWidth(0.5f);
    }

    // =========================================================================
    // Branded header
    // =========================================================================

    private static float drawBrandedHeader(PDPageContentStream cs, Brand b, float y) throws IOException {
        // Dark header bar
        float barH = 52;
        cs.setNonStrokingColor(b.dark[0], b.dark[1], b.dark[2]);
        cs.addRect(0, y - barH + 12, PW, barH);
        cs.fill();

        // Accent underline
        cs.setNonStrokingColor(b.accent[0], b.accent[1], b.accent[2]);
        cs.addRect(0, y - barH + 9, PW, 3);
        cs.fill();

        // Company name in header
        cs.setNonStrokingColor(1, 1, 1);
        cs.beginText();
        cs.setFont(HELVETICA_BOLD, 22);
        cs.newLineAtOffset(ML, y - 18);
        cs.showText(b.name);
        cs.endText();

        // Subtitle
        cs.setNonStrokingColor(b.accent[0], b.accent[1], b.accent[2]);
        cs.beginText();
        cs.setFont(HELVETICA, 9);
        cs.newLineAtOffset(ML, y - 33);
        cs.showText(b.subtitle);
        cs.endText();

        // Contract number on right side
        cs.setNonStrokingColor(1, 1, 1);
        float noW = HELVETICA.getStringWidth(b.contractNo) / 1000 * 8;
        cs.beginText();
        cs.setFont(COURIER, 8);
        cs.newLineAtOffset(PW - MR - noW, y - 18);
        cs.showText(b.contractNo);
        cs.endText();

        // Reset
        cs.setNonStrokingColor(0, 0, 0);

        return y - barH + 6;
    }

    // =========================================================================
    // Contract title
    // =========================================================================

    private static float drawContractTitle(PDPageContentStream cs, Brand b, float y) throws IOException {
        // Title in brand primary color
        cs.setNonStrokingColor(b.primary[0], b.primary[1], b.primary[2]);
        float titleSize = 15;
        float tw = HELVETICA_BOLD.getStringWidth(b.contractTitle) / 1000 * titleSize;
        cs.beginText();
        cs.setFont(HELVETICA_BOLD, titleSize);
        cs.newLineAtOffset((PW - tw) / 2, y);
        cs.showText(b.contractTitle);
        cs.endText();
        y -= 15;

        // Subtitle
        cs.setNonStrokingColor(0.35f, 0.35f, 0.35f);
        float stw = HELVETICA.getStringWidth(b.contractSubtitle) / 1000 * 9;
        cs.beginText();
        cs.setFont(HELVETICA, 9);
        cs.newLineAtOffset((PW - stw) / 2, y);
        cs.showText(b.contractSubtitle);
        cs.endText();
        y -= 12;

        // Decorative diamond separator
        cs.setNonStrokingColor(b.accent[0], b.accent[1], b.accent[2]);
        float cx = PW / 2;
        drawDiamond(cs, cx - 30, y, 3);
        drawDiamond(cs, cx - 15, y, 3);
        drawDiamond(cs, cx, y, 4);
        drawDiamond(cs, cx + 15, y, 3);
        drawDiamond(cs, cx + 30, y, 3);
        cs.setNonStrokingColor(0, 0, 0);

        return y - 6;
    }

    // =========================================================================
    // Parties section
    // =========================================================================

    private static float drawPartiesSection(PDPageContentStream cs, Brand b, float y) throws IOException {
        y = drawSectionHeading(cs, b, 1, "CONTRACTING PARTIES", y);
        y -= 4;

        for (int i = 0; i < b.parties.length; i++) {
            // Party role label with accent color
            cs.setNonStrokingColor(b.primary[0], b.primary[1], b.primary[2]);
            cs.beginText();
            cs.setFont(HELVETICA_BOLD, 10);
            cs.newLineAtOffset(ML, y);
            cs.showText(b.partyLabels[i] + ":");
            cs.endText();
            cs.setNonStrokingColor(0, 0, 0);
            y -= LH;

            // Name (+ company if set)
            String nameStr = b.partyNames[i];
            if (b.partyCompanies != null && b.partyCompanies[i] != null && !b.partyCompanies[i].isEmpty()) {
                nameStr += "  (" + b.partyCompanies[i] + ")";
            }
            cs.beginText();
            cs.setFont(HELVETICA, 9);
            cs.newLineAtOffset(ML + 8, y);
            cs.showText(nameStr);
            cs.endText();
            y -= 12;

            // Email
            cs.setNonStrokingColor(0.3f, 0.3f, 0.3f);
            cs.beginText();
            cs.setFont(HELVETICA, 8);
            cs.newLineAtOffset(ML + 8, y);
            cs.showText(b.partyEmails[i]);
            cs.endText();
            cs.setNonStrokingColor(0, 0, 0);
            y -= 10;

            if (i < b.parties.length - 1) y -= 2;
        }
        return y;
    }

    // =========================================================================
    // Section heading with number
    // =========================================================================

    private static float drawSectionHeading(PDPageContentStream cs, Brand b, int num, String title, float y) throws IOException {
        // Number circle
        float circleR = 7;
        float circleX = ML + circleR;
        float circleY = y - 1;
        cs.setNonStrokingColor(b.primary[0], b.primary[1], b.primary[2]);
        drawCircle(cs, circleX, circleY, circleR);

        // Number inside circle
        cs.setNonStrokingColor(1, 1, 1);
        String numStr = String.valueOf(num);
        float nw = HELVETICA_BOLD.getStringWidth(numStr) / 1000 * 8;
        cs.beginText();
        cs.setFont(HELVETICA_BOLD, 8);
        cs.newLineAtOffset(circleX - nw / 2, circleY - 3);
        cs.showText(numStr);
        cs.endText();

        // Title text
        cs.setNonStrokingColor(b.primary[0], b.primary[1], b.primary[2]);
        cs.beginText();
        cs.setFont(HELVETICA_BOLD, 11);
        cs.newLineAtOffset(ML + circleR * 2 + 6, y - 4);
        cs.showText(title);
        cs.endText();

        cs.setNonStrokingColor(0, 0, 0);
        return y - LH - 2;
    }

    // =========================================================================
    // Decorative separator line
    // =========================================================================

    private static float drawDecoLine(PDPageContentStream cs, Brand b, float y) throws IOException {
        // Left segment in accent
        cs.setStrokingColor(b.accent[0], b.accent[1], b.accent[2]);
        cs.setLineWidth(0.8f);
        cs.moveTo(ML, y);
        cs.lineTo(ML + 80, y);
        cs.stroke();

        // Fade to gray
        cs.setStrokingColor(0.82f, 0.82f, 0.82f);
        cs.setLineWidth(0.3f);
        cs.moveTo(ML + 80, y);
        cs.lineTo(PW - MR, y);
        cs.stroke();

        cs.setStrokingColor(0, 0, 0);
        cs.setLineWidth(0.5f);
        return y;
    }

    // =========================================================================
    // Signature section
    // =========================================================================

    private static float drawSignatureSection(PDPageContentStream cs, Brand b, float y) throws IOException {
        y = drawSectionHeading(cs, b, b.sections.length + 2, "SIGNATURES", y);
        y -= 3;

        cs.setNonStrokingColor(0.3f, 0.3f, 0.3f);
        cs.beginText();
        cs.setFont(HELVETICA_OBLIQUE, 8);
        cs.newLineAtOffset(ML, y);
        cs.showText("By signing below, all parties confirm acceptance of all terms and conditions herein.");
        cs.endText();
        y -= 16;

        int nSigs = b.parties.length;
        float sigWidth, gap;

        if (nSigs <= 2) {
            sigWidth = 200;
            gap = CW - nSigs * sigWidth;
        } else {
            sigWidth = Math.min(150, (CW - 20) / nSigs);
            gap = (CW - nSigs * sigWidth) / Math.max(1, nSigs - 1);
        }

        float sigHeight = 50;
        float sigY = y;

        for (int i = 0; i < nSigs; i++) {
            float x;
            if (nSigs <= 2) {
                x = (i == 0) ? ML : PW - MR - sigWidth;
            } else {
                x = ML + i * (sigWidth + gap);
            }

            // Label above sig area
            cs.setNonStrokingColor(b.primary[0], b.primary[1], b.primary[2]);
            cs.beginText();
            cs.setFont(HELVETICA_BOLD, 8);
            cs.newLineAtOffset(x, sigY + 2);
            cs.showText(b.partyLabels[i]);
            cs.endText();

            // Name below label
            cs.setNonStrokingColor(0.35f, 0.35f, 0.35f);
            cs.beginText();
            cs.setFont(HELVETICA, 7);
            cs.newLineAtOffset(x, sigY - 8);
            cs.showText(b.partyNames[i]);
            cs.endText();

            if (b.useSigTags) {
                // SIG-tag text
                cs.setNonStrokingColor(0.7f, 0.7f, 0.7f);
                String tag = String.format("##SIG{role:'%s',displayname:'%s',required:true,w:'%dmm',h:'13mm'}",
                        b.parties[i], b.partyLabels[i], nSigs <= 2 ? 50 : 38);
                cs.beginText();
                cs.setFont(HELVETICA, nSigs <= 2 ? 6 : 5);
                cs.newLineAtOffset(x, sigY - 30);
                cs.showText(tag);
                cs.endText();
            } else {
                // Dotted box with accent color
                cs.setStrokingColor(b.accent[0], b.accent[1], b.accent[2]);
                cs.setLineDashPattern(new float[]{4, 3}, 0);
                cs.setLineWidth(0.7f);
                cs.addRect(x, sigY - sigHeight, sigWidth, sigHeight - 12);
                cs.stroke();
                cs.setLineDashPattern(new float[]{}, 0);
            }
        }

        cs.setNonStrokingColor(0, 0, 0);
        cs.setStrokingColor(0, 0, 0);
        return sigY - sigHeight - 5;
    }

    // =========================================================================
    // Footer
    // =========================================================================

    private static void drawFooter(PDPageContentStream cs, Brand b) throws IOException {
        float footerY = 18;

        // Accent bar above footer
        cs.setNonStrokingColor(b.accent[0], b.accent[1], b.accent[2]);
        cs.addRect(ML, footerY + 8, CW, 0.5f);
        cs.fill();

        // Footer text
        cs.setNonStrokingColor(0.5f, 0.5f, 0.5f);
        cs.beginText();
        cs.setFont(HELVETICA, 6.5f);
        cs.newLineAtOffset(ML, footerY);
        cs.showText(b.name + "  |  " + b.subtitle + "  |  " + b.contractNo);
        cs.endText();

        // Right side
        String gen = "Generated by inSign API Explorer  \u2014  getinsign.com";
        float gw = HELVETICA.getStringWidth(gen) / 1000 * 6.5f;
        cs.beginText();
        cs.setFont(HELVETICA_OBLIQUE, 6.5f);
        cs.newLineAtOffset(PW - MR - gw, footerY);
        cs.showText(gen);
        cs.endText();

        cs.setNonStrokingColor(0, 0, 0);
    }

    // =========================================================================
    // AcroForm signature fields
    // =========================================================================

    private static void addSignatureFields(PDDocument doc, PDPage page, Brand b) throws IOException {
        int nSigs = b.parties.length;
        float sigWidth = nSigs <= 2 ? 200 : Math.min(150, (CW - 20) / nSigs);
        float gap = nSigs <= 2 ? 0 : (CW - nSigs * sigWidth) / Math.max(1, nSigs - 1);
        float sigHeight = 38;
        float sigFieldY = 80; // approximate Y in PDF coordinates

        PDAcroForm acroForm = new PDAcroForm(doc);
        doc.getDocumentCatalog().setAcroForm(acroForm);

        for (int i = 0; i < nSigs; i++) {
            float x;
            if (nSigs <= 2) {
                x = (i == 0) ? ML : PW - MR - sigWidth;
            } else {
                x = ML + i * (sigWidth + gap);
            }

            PDSignatureField sigField = new PDSignatureField(acroForm);
            sigField.setPartialName(b.parties[i]);
            sigField.setAlternateFieldName(b.partyLabels[i]);

            PDAnnotationWidget widget = sigField.getWidgets().get(0);
            widget.setRectangle(new PDRectangle(x, sigFieldY, sigWidth, sigHeight));
            widget.setPage(page);
            page.getAnnotations().add(widget);
            acroForm.getFields().add(sigField);
        }
    }

    // =========================================================================
    // Drawing primitives
    // =========================================================================

    private static float drawParagraph(PDPageContentStream cs, String text, float y, float fontSize) throws IOException {
        float maxWidth = CW - 16;
        String[] words = text.split("\\s+");
        StringBuilder line = new StringBuilder();
        cs.setFont(HELVETICA, fontSize);

        for (String word : words) {
            String test = line.length() == 0 ? word : line + " " + word;
            float tw = HELVETICA.getStringWidth(test) / 1000 * fontSize;
            if (tw > maxWidth && line.length() > 0) {
                cs.beginText();
                cs.newLineAtOffset(ML + 8, y);
                cs.showText(line.toString());
                cs.endText();
                y -= LH;
                line = new StringBuilder(word);
            } else {
                line = new StringBuilder(test);
            }
        }
        if (line.length() > 0) {
            cs.beginText();
            cs.newLineAtOffset(ML + 8, y);
            cs.showText(line.toString());
            cs.endText();
            y -= LH;
        }
        return y;
    }

    private static void drawCircle(PDPageContentStream cs, float cx, float cy, float r) throws IOException {
        float k = 0.5523f; // bezier approximation of circle
        cs.moveTo(cx, cy + r);
        cs.curveTo(cx + r * k, cy + r, cx + r, cy + r * k, cx + r, cy);
        cs.curveTo(cx + r, cy - r * k, cx + r * k, cy - r, cx, cy - r);
        cs.curveTo(cx - r * k, cy - r, cx - r, cy - r * k, cx - r, cy);
        cs.curveTo(cx - r, cy + r * k, cx - r * k, cy + r, cx, cy + r);
        cs.fill();
    }

    private static void drawDiamond(PDPageContentStream cs, float cx, float cy, float r) throws IOException {
        cs.moveTo(cx, cy + r);
        cs.lineTo(cx + r, cy);
        cs.lineTo(cx, cy - r);
        cs.lineTo(cx - r, cy);
        cs.closePath();
        cs.fill();
    }

    // =========================================================================
    // Color helpers
    // =========================================================================

    private static float[] hex(String hex) {
        hex = hex.replace("#", "");
        return new float[]{
                Integer.parseInt(hex.substring(0, 2), 16) / 255f,
                Integer.parseInt(hex.substring(2, 4), 16) / 255f,
                Integer.parseInt(hex.substring(4, 6), 16) / 255f
        };
    }

    // =========================================================================
    // Brand definitions — each with unique contract content
    // =========================================================================

    private static Brand[] createAllBrands() {
        return new Brand[]{
                createAcme(), createGreenleaf(), createNova(), createBlueprint(),
                createSolis(), createSentinel(), createAegis(), createHarbor(),
                createApex(), createPrism(), createMosaic(), createNexus()
        };
    }

    // --- 1. ACME Corporation ---
    private static Brand createAcme() {
        Brand b = new Brand("acme");
        b.name = "ACME Corporation";
        b.subtitle = "Digital Transformation & Enterprise Solutions";
        b.primary = hex("#0D47A1"); b.accent = hex("#42A5F5"); b.dark = hex("#1B2838");
        b.contractTitle = "ENTERPRISE SOFTWARE LICENSE AGREEMENT";
        b.contractSubtitle = "SaaS Platform Subscription \u2014 Annual License";
        b.contractNo = "ACME-LIC-2026-00847";
        b.parties = new String[]{"licensor", "licensee"};
        b.partyLabels = new String[]{"Licensor", "Licensee"};
        b.partyNames = new String[]{"Dr. Stefan Richter", "Andrea Bergmann"};
        b.partyCompanies = new String[]{"ACME Corporation", "Stadtwerke Rosenheim GmbH"};
        b.partyEmails = new String[]{"s.richter@acme-corp.de", "a.bergmann@sw-rosenheim.de"};
        b.sections = new String[]{"LICENSE GRANT", "FEES AND PAYMENT", "DATA PROTECTION", "GOVERNING LAW"};
        b.sectionText = new String[][]{
                {"The Licensor hereby grants the Licensee a non-exclusive, non-transferable license to use the ACME Enterprise Platform (\"the Software\") for the duration of this agreement. The license covers up to 250 named users and includes access to all standard modules, API integrations, and quarterly platform updates.",
                        "The Licensee may deploy the Software in a cloud-hosted or on-premises environment as specified in Schedule A. Sub-licensing, reverse engineering, or redistribution of the Software is strictly prohibited."},
                {"The annual license fee of EUR 128,400.00 shall be payable in advance within 30 days of the contract anniversary date. Support and maintenance services (24/7 enterprise tier) are included. Additional user packs of 50 seats may be purchased at EUR 18,200.00 per pack per year."},
                {"Both parties shall comply with the EU General Data Protection Regulation (GDPR) and the German Federal Data Protection Act (BDSG). The Licensor acts as a data processor under a separate Data Processing Agreement (DPA) attached as Schedule B. All customer data remains the property of the Licensee."},
                {"This agreement shall be governed by the laws of the Federal Republic of Germany. The exclusive venue for all disputes arising from this contract shall be Munich, Germany."}
        };
        return b;
    }

    // --- 2. GreenLeaf ---
    private static Brand createGreenleaf() {
        Brand b = new Brand("greenleaf");
        b.name = "GreenLeaf Sustainability";
        b.subtitle = "Clean Energy \u2022 Smart Agriculture \u2022 Carbon Neutral";
        b.primary = hex("#1B5E20"); b.accent = hex("#66BB6A"); b.dark = hex("#1B2F1B");
        b.contractTitle = "CARBON OFFSET PURCHASE AGREEMENT";
        b.contractSubtitle = "Verified Emission Reduction Credits \u2014 Annual Supply";
        b.contractNo = "GL-CO2-2026-01523";
        b.parties = new String[]{"supplier", "buyer"};
        b.partyLabels = new String[]{"Offset Supplier", "Carbon Buyer"};
        b.partyNames = new String[]{"Lena Schwarz", "Markus Tillmann"};
        b.partyCompanies = new String[]{"GreenLeaf Sustainability AG", "Brauerei Tillmann & Soehne"};
        b.partyEmails = new String[]{"l.schwarz@greenleaf-sustain.eu", "m.tillmann@tillmann-bier.de"};
        b.sections = new String[]{"CARBON CREDITS", "VERIFICATION AND STANDARDS", "DELIVERY AND RETIREMENT", "LIABILITY"};
        b.sectionText = new String[][]{
                {"The Supplier agrees to deliver 5,000 tonnes of verified CO2-equivalent emission reduction credits (\"Carbon Credits\") to the Buyer during the calendar year 2026. Credits shall be sourced from certified reforestation and wind energy projects in the DACH region.",
                        "The total consideration for the credits is EUR 87,500.00 (EUR 17.50 per tonne CO2e), payable quarterly in arrears upon delivery of the corresponding tranche of credits."},
                {"All credits delivered under this agreement shall be certified under the Gold Standard or Verified Carbon Standard (VCS). The Supplier shall provide serial numbers and registry links for each credit batch within 5 business days of issuance."},
                {"Credits shall be transferred to the Buyer's account on the relevant registry within 10 business days of payment confirmation. The Buyer may request retirement of credits on their behalf, with retirement certificates provided within 30 days."},
                {"The Supplier warrants that all credits are genuine, have not been previously sold or retired, and originate from projects complying with all applicable environmental regulations. In the event of invalidity, the Supplier shall replace affected credits at no additional cost."}
        };
        return b;
    }

    // --- 3. NOVA Finance ---
    private static Brand createNova() {
        Brand b = new Brand("nova");
        b.name = "NOVA Finance";
        b.subtitle = "Investment Banking \u2022 Asset Management \u2022 Insurance";
        b.primary = hex("#B71C1C"); b.accent = hex("#EF5350"); b.dark = hex("#212121");
        b.contractTitle = "DISCRETIONARY PORTFOLIO MANAGEMENT AGREEMENT";
        b.contractSubtitle = "Private Wealth Management \u2014 Balanced Growth Strategy";
        b.contractNo = "NF-DPM-2026-04291";
        b.parties = new String[]{"manager", "client"};
        b.partyLabels = new String[]{"Portfolio Manager", "Client"};
        b.partyNames = new String[]{"Dr. Katharina Engel", "Robert von Hagen"};
        b.partyCompanies = new String[]{"NOVA Finance AG", ""};
        b.partyEmails = new String[]{"k.engel@nova-finance.com", "r.vonhagen@privatmail.de"};
        b.sections = new String[]{"INVESTMENT MANDATE", "FEES AND COMPENSATION", "RISK DISCLOSURE", "TERMINATION"};
        b.sectionText = new String[][]{
                {"The Client grants NOVA Finance AG discretionary authority to manage the investment portfolio described herein, with an initial allocation of EUR 2,500,000.00. The investment strategy shall follow the \"Balanced Growth\" profile: 55% equities, 30% fixed income, 10% alternative assets, 5% cash equivalents.",
                        "The Manager shall adhere to the investment guidelines specified in Appendix A, including ESG screening criteria and geographic diversification constraints."},
                {"Management fees: 0.95% p.a. of assets under management, calculated quarterly. Performance fee: 12% of returns exceeding the benchmark (60% MSCI World / 40% Bloomberg Aggregate), subject to a high-water mark. Custody fees are borne by the Client as per the depository agreement."},
                {"The Client acknowledges that investments carry inherent risks, including potential loss of capital. Past performance does not guarantee future results. The Manager does not guarantee any minimum return. The Client confirms classification as a professional investor under MiFID II."},
                {"Either party may terminate this agreement with 90 days' written notice. Upon termination, the Manager shall liquidate positions as instructed by the Client or transfer securities in-kind. Outstanding fees shall become due immediately upon termination."}
        };
        return b;
    }

    // --- 4. BluePrint ---
    private static Brand createBlueprint() {
        Brand b = new Brand("blueprint");
        b.name = "BluePrint Design Studio";
        b.subtitle = "Architecture \u2022 Engineering \u2022 Digital Planning";
        b.primary = hex("#37474F"); b.accent = hex("#26A69A"); b.dark = hex("#263238");
        b.contractTitle = "ARCHITECTURAL SERVICES AGREEMENT";
        b.contractSubtitle = "Mixed-Use Development \u2014 Concept Through Construction";
        b.contractNo = "BP-ARCH-2026-00156";
        b.parties = new String[]{"architect", "developer"};
        b.partyLabels = new String[]{"Lead Architect", "Property Developer"};
        b.partyNames = new String[]{"Prof. Michael Vandenberg", "Julia Krause"};
        b.partyCompanies = new String[]{"BluePrint Design Studio GmbH", "Krause Projektentwicklung AG"};
        b.partyEmails = new String[]{"m.vandenberg@blueprint-studio.de", "j.krause@krause-projekt.de"};
        b.sections = new String[]{"SCOPE OF SERVICES", "PROJECT TIMELINE", "COMPENSATION", "INTELLECTUAL PROPERTY"};
        b.sectionText = new String[][]{
                {"BluePrint shall provide full architectural services for the planned mixed-use development at Theresienhof, Munich (Plot 14-B, approx. 8,200 sqm GFA). Services include: concept design, schematic design, detailed design with BIM Level 2 deliverables, building permit documentation, tender support, and construction oversight.",
                        "The design shall accommodate 42 residential units, 1,800 sqm commercial space (ground floor), and an underground car park with 85 spaces, in compliance with Munich building code and KfW-55 energy standards."},
                {"Phase 1 (Concept): 8 weeks from contract signing. Phase 2 (Schematic + Permits): 16 weeks. Phase 3 (Detailed Design + BIM): 12 weeks. Phase 4 (Construction Administration): duration of build, estimated 18 months. Milestones and deliverables are detailed in Schedule C."},
                {"Total professional fees: EUR 1,240,000.00, structured according to HOAI fee scale phases 1-9. Payments are milestone-based as per the schedule in Appendix B. Travel expenses and specialist consultant fees (structural, MEP) shall be reimbursed at cost plus 5% coordination fee."},
                {"All design documents, BIM models, drawings, and specifications created under this agreement shall become the property of the Developer upon full payment. BluePrint retains the right to use anonymized project imagery for portfolio and competition purposes."}
        };
        return b;
    }

    // --- 5. SOLIS Technology ---
    private static Brand createSolis() {
        Brand b = new Brand("solis");
        b.name = "SOLIS Technology";
        b.subtitle = "Solar \u2022 Wind \u2022 Smart Grid \u2022 Energy Storage";
        b.primary = hex("#E65100"); b.accent = hex("#1565C0"); b.dark = hex("#1A1A2E");
        b.contractTitle = "SOLAR ENERGY SYSTEM SUPPLY AND INSTALLATION";
        b.contractSubtitle = "Commercial Rooftop PV \u2014 380 kWp Turn-Key System";
        b.contractNo = "SOL-PV-2026-02847";
        b.parties = new String[]{"installer", "owner"};
        b.partyLabels = new String[]{"System Integrator", "Building Owner"};
        b.partyNames = new String[]{"Ing. Patrick Hauser", "Sabine Ott-Kessler"};
        b.partyCompanies = new String[]{"SOLIS Technology GmbH", "Logistikzentrum Ott KG"};
        b.partyEmails = new String[]{"p.hauser@solis-tech.eu", "s.ott@lz-ott.de"};
        b.sections = new String[]{"SYSTEM SPECIFICATION", "INSTALLATION AND COMMISSIONING", "WARRANTY AND MAINTENANCE", "ENERGY YIELD GUARANTEE"};
        b.sectionText = new String[][]{
                {"SOLIS shall supply and install a 380 kWp rooftop photovoltaic system comprising 760 high-efficiency monocrystalline modules (500 Wp each), 4 string inverters (SMA Sunny Tripower 100 kW), mounting system, DC/AC cabling, monitoring gateway, and grid connection equipment.",
                        "The system includes a 120 kWh lithium-iron-phosphate battery storage unit for peak-shaving and self-consumption optimization. All components are certified to IEC 61215/61730 standards."},
                {"Installation shall commence within 6 weeks of building permit approval and structural assessment sign-off. Estimated installation duration: 4 weeks. Commissioning includes performance ratio test per IEC 61724, grid synchronization, and monitoring system activation. SOLIS provides all necessary permits and utility coordination."},
                {"Product warranty: 25 years on modules (min. 85% rated output at year 25), 10 years on inverters, 10 years on battery storage. Workmanship warranty: 5 years. SOLIS offers an optional O&M package at EUR 4,200/year including bi-annual inspections, cleaning, and monitoring."},
                {"SOLIS guarantees a minimum specific yield of 980 kWh/kWp in the first operating year under standard meteorological conditions (TMY data for Munich). If actual yield falls below 95% of the guarantee, SOLIS shall compensate the shortfall at EUR 0.12/kWh. Measurement per calibrated revenue meter."}
        };
        return b;
    }

    // --- 6. Sentinel Insurance ---
    private static Brand createSentinel() {
        Brand b = new Brand("sentinel");
        b.name = "Sentinel Insurance";
        b.subtitle = "Protection You Can Trust Since 1952";
        b.primary = hex("#1A237E"); b.accent = hex("#FFD600"); b.dark = hex("#0D1457");
        b.contractTitle = "COMMERCIAL PROPERTY INSURANCE POLICY";
        b.contractSubtitle = "All-Risk Coverage \u2014 Industrial Premises";
        b.contractNo = "SI-CPP-2026-18734";
        b.parties = new String[]{"insurer", "policyholder"};
        b.partyLabels = new String[]{"Insurer", "Policyholder"};
        b.partyNames = new String[]{"Dipl.-Kfm. Helmut Brandt", "Georg Maierhof"};
        b.partyCompanies = new String[]{"Sentinel Insurance AG", "Maierhof Maschinenbau GmbH"};
        b.partyEmails = new String[]{"h.brandt@sentinel-ins.de", "g.maierhof@maierhof-mb.de"};
        b.sections = new String[]{"INSURED PROPERTY", "COVERAGE AND EXCLUSIONS", "PREMIUM AND DEDUCTIBLE", "CLAIMS PROCEDURE"};
        b.sectionText = new String[][]{
                {"This policy covers the industrial premises located at Industriestrasse 44-48, 85399 Hallbergmoos, comprising: main production hall (4,200 sqm), warehouse (2,100 sqm), office building (800 sqm), and outdoor storage yard (1,500 sqm). Total insured value: EUR 12,800,000.00 (replacement cost basis).",
                        "Coverage extends to building structure, permanently installed machinery, inventory, and business interruption for up to 12 months following a covered loss event."},
                {"All-risk coverage including: fire, lightning, explosion, storm, hail, water damage, burglary, vandalism, impact damage (vehicles/aircraft), and glass breakage. Exclusions: war, nuclear events, gradual deterioration, intentional damage, wear and tear. Natural hazard coverage (flood, earthquake) available as endorsement."},
                {"Annual gross premium: EUR 34,200.00, payable in quarterly instalments. General deductible: EUR 5,000 per claim. Fire deductible: EUR 10,000. Business interruption waiting period: 48 hours. Premium adjustment clause applies based on annual turnover declaration."},
                {"The Policyholder shall notify the Insurer of any loss event within 72 hours of discovery. A written claim with supporting documentation must be submitted within 30 days. The Insurer shall acknowledge receipt within 5 business days and appoint a loss adjuster within 10 business days for claims exceeding EUR 25,000."}
        };
        return b;
    }

    // --- 7. Aegis Life ---
    private static Brand createAegis() {
        Brand b = new Brand("aegis");
        b.name = "Aegis Life";
        b.subtitle = "Life \u2022 Health \u2022 Disability \u2022 Long-Term Care";
        b.primary = hex("#00695C"); b.accent = hex("#80CBC4"); b.dark = hex("#004D40");
        b.contractTitle = "GROUP LIFE AND DISABILITY INSURANCE";
        b.contractSubtitle = "Employee Benefits Program \u2014 Comprehensive Coverage";
        b.contractNo = "AL-GLD-2026-05528";
        b.parties = new String[]{"insurer", "employer"};
        b.partyLabels = new String[]{"Insurer", "Employer"};
        b.partyNames = new String[]{"Christine Bauer-Lehmann", "Dr. Florian Meister"};
        b.partyCompanies = new String[]{"Aegis Life Versicherung AG", "MedTech Innovations GmbH"};
        b.partyEmails = new String[]{"c.bauer@aegis-life.de", "f.meister@medtech-innov.de"};
        b.sections = new String[]{"GROUP COVERAGE", "BENEFIT SCHEDULE", "PREMIUM CALCULATION", "ENROLLMENT AND ELIGIBILITY"};
        b.sectionText = new String[][]{
                {"Aegis Life agrees to provide group life and disability insurance coverage for all eligible employees of MedTech Innovations GmbH. The policy covers a minimum of 120 and a maximum of 200 employees, including full-time and permanent part-time staff (minimum 20 hours/week).",
                        "Dependents of insured employees (spouse/partner and children up to age 25) are eligible for supplementary life coverage at 50% of the employee benefit level."},
                {"Group Term Life: 3x annual gross salary, maximum EUR 450,000 per insured. Accidental Death & Dismemberment (AD&D): additional 2x salary. Long-term Disability: 60% of gross salary after 90-day elimination period, benefit payable to age 65. Critical Illness rider: EUR 50,000 lump sum for first diagnosis of specified conditions."},
                {"Monthly premium per employee: calculated based on census data (age, gender, salary). Estimated average: EUR 89.50/employee/month. The Employer contributes 70%, employees contribute 30% via payroll deduction. Premiums are guaranteed for 24 months from the policy effective date."},
                {"New employees become eligible after completion of the probationary period (typically 6 months). Late enrollees may be subject to evidence of insurability. Annual open enrollment period: November 1-30. The Employer shall provide updated census data quarterly."}
        };
        return b;
    }

    // --- 8. Harbor Re ---
    private static Brand createHarbor() {
        Brand b = new Brand("harbor");
        b.name = "Harbor Re";
        b.subtitle = "Reinsurance \u2022 Risk Analytics \u2022 Capital Solutions";
        b.primary = hex("#880E4F"); b.accent = hex("#F48FB1"); b.dark = hex("#6A0039");
        b.contractTitle = "EXCESS OF LOSS REINSURANCE TREATY";
        b.contractSubtitle = "Property Catastrophe \u2014 Per Occurrence Basis";
        b.contractNo = "HR-XOL-2026-00093";
        b.parties = new String[]{"reinsurer", "cedent"};
        b.partyLabels = new String[]{"Reinsurer", "Ceding Company"};
        b.partyNames = new String[]{"James P. Whitfield", "Dr. Monika Seidl"};
        b.partyCompanies = new String[]{"Harbor Re Ltd., Zurich", "Alpenland Versicherung AG"};
        b.partyEmails = new String[]{"j.whitfield@harbor-re.com", "m.seidl@alpenland-vers.at"};
        b.sections = new String[]{"COVERAGE AND LIMITS", "PREMIUM AND REINSTATEMENTS", "LOSS SETTLEMENT", "ARBITRATION"};
        b.sectionText = new String[][]{
                {"Harbor Re agrees to indemnify the Cedent for property catastrophe losses in excess of EUR 25,000,000 (retention) up to EUR 75,000,000 per occurrence. The treaty covers natural catastrophe perils including windstorm, flood, earthquake, and hail affecting risks located within the European Economic Area.",
                        "The coverage attaches to net retained losses after deduction of all inuring reinsurance and applies on a per-occurrence, losses-occurring-during basis for the treaty period January 1 to December 31, 2026."},
                {"Minimum and deposit premium: EUR 2,850,000, payable in quarterly instalments. Final premium: adjusted based on the Cedent's subject net earned premium, rate: 2.28% as-if. One free reinstatement at 100% additional premium, second reinstatement at 150% pro-rata temporis."},
                {"The Cedent shall report each loss to Harbor Re within 14 days of the loss exceeding 50% of the retention. Cash loss advances shall be made within 30 days of proof of loss presentation. Final settlement within 90 days of agreed loss amount. Interest on late payments: 3-month EURIBOR + 200 bps."},
                {"All disputes arising from this treaty shall be resolved by arbitration in Zurich, Switzerland, under the rules of the Swiss Chambers' Arbitration Institution. The tribunal shall consist of three arbitrators, each party appointing one, with the chair selected by the two party-appointed arbitrators."}
        };
        return b;
    }

    // --- 9. Apex Assurance ---
    private static Brand createApex() {
        Brand b = new Brand("apex");
        b.name = "Apex Assurance";
        b.subtitle = "Commercial \u2022 Property \u2022 Casualty \u2022 Specialty";
        b.primary = hex("#4A148C"); b.accent = hex("#CE93D8"); b.dark = hex("#311B92");
        b.contractTitle = "PROFESSIONAL LIABILITY INSURANCE";
        b.contractSubtitle = "Errors & Omissions \u2014 Technology Sector Coverage";
        b.contractNo = "AA-PLI-2026-07612";
        b.parties = new String[]{"underwriter", "insured"};
        b.partyLabels = new String[]{"Underwriter", "Insured"};
        b.partyNames = new String[]{"Bernhard Stein", "Ing. Carla Hoffmann"};
        b.partyCompanies = new String[]{"Apex Assurance SE", "CloudNine Solutions AG"};
        b.partyEmails = new String[]{"b.stein@apex-assurance.eu", "c.hoffmann@cloudnine.io"};
        b.sections = new String[]{"INSURING AGREEMENT", "COVERAGE TERRITORY AND LIMITS", "CONDITIONS AND EXCLUSIONS", "REPORTING"};
        b.sectionText = new String[][]{
                {"Apex Assurance agrees to indemnify the Insured against claims arising from professional services rendered in the field of software development, cloud infrastructure, and IT consulting. Coverage includes allegations of negligence, errors, omissions, or breach of professional duty that result in financial loss to third parties.",
                        "The policy extends to cover cyber-related professional liability claims, including data breaches arising from professional negligence, and regulatory defense costs related to the Insured's professional activities."},
                {"Territory: worldwide, excluding USA/Canada. Applicable courts: EU/EEA jurisdictions. Aggregate limit of liability: EUR 10,000,000. Per-claim limit: EUR 5,000,000. Defense costs: included within the limit (\"burning limits\" basis). Retroactive date: January 1, 2022."},
                {"Claims-made basis with 60-day extended reporting provision. Exclusions: bodily injury, property damage, criminal acts, prior/pending litigation, contractual liability assumed beyond professional duties, patent infringement. Sub-limit for regulatory proceedings: EUR 1,000,000."},
                {"The Insured shall notify Apex of any claim or circumstance that may give rise to a claim within 30 days of becoming aware. Late notification may result in coverage limitation. Annual policy renewal: subject to updated revenue declaration and loss experience review."}
        };
        return b;
    }

    // --- 10. Prism Digital ---
    private static Brand createPrism() {
        Brand b = new Brand("prism");
        b.name = "Prism Digital";
        b.subtitle = "Creative Agency \u2022 Digital Media \u2022 Brand Strategy";
        b.primary = hex("#2979FF"); b.accent = hex("#FF9100"); b.dark = hex("#1A1A2E");
        b.contractTitle = "CREATIVE SERVICES RETAINER AGREEMENT";
        b.contractSubtitle = "Brand Relaunch Campaign \u2014 Full-Service Engagement";
        b.contractNo = "PD-CRE-2026-00319";
        b.parties = new String[]{"agency", "client"};
        b.partyLabels = new String[]{"Creative Agency", "Client"};
        b.partyNames = new String[]{"Nina Castellano", "Tobias Wendt"};
        b.partyCompanies = new String[]{"Prism Digital GmbH", "SportVision European GmbH"};
        b.partyEmails = new String[]{"nina@prism-digital.io", "t.wendt@sportvision.eu"};
        b.sections = new String[]{"SCOPE OF CREATIVE SERVICES", "DELIVERABLES AND TIMELINE", "COMPENSATION", "INTELLECTUAL PROPERTY AND USAGE RIGHTS"};
        b.sectionText = new String[][]{
                {"Prism Digital shall provide comprehensive creative and digital marketing services for the relaunch of the SportVision brand, including: brand identity redesign, visual language system, website UX/UI design and development, social media content strategy, launch campaign (digital + OOH), and brand guidelines documentation.",
                        "The engagement follows a phased approach: Discovery (2 weeks), Strategy (3 weeks), Creative Development (6 weeks), Production (4 weeks), and Launch Support (4 weeks)."},
                {"Phase 1 — Brand Strategy: brand audit, competitor analysis, positioning workshop, brand architecture document. Phase 2 — Visual Identity: logo system, color palette, typography, iconography, motion design principles. Phase 3 — Digital: responsive website (Next.js), app UI kit, email templates. Phase 4 — Campaign: 3 hero films (30s), 12 social assets, OOH key visuals, media plan."},
                {"Monthly retainer: EUR 42,000 for the 19-week engagement period (total EUR 199,500). Production costs (printing, media buying, stock assets, third-party services) are billed at cost plus 15% markup. Additional hours beyond the agreed scope: EUR 165/hour (strategy), EUR 140/hour (design), EUR 155/hour (development)."},
                {"Upon full payment, all final deliverables and source files shall be transferred to the Client with unlimited, worldwide, perpetual usage rights. Prism Digital retains portfolio and case-study rights. Third-party assets (fonts, stock photography) are licensed separately under their respective terms."}
        };
        return b;
    }

    // --- 11. Mosaic Labs ---
    private static Brand createMosaic() {
        Brand b = new Brand("mosaic");
        b.name = "Mosaic Labs";
        b.subtitle = "Research \u2022 Innovation \u2022 Technology Transfer";
        b.primary = hex("#1976D2"); b.accent = hex("#F57C00"); b.dark = hex("#212121");
        b.contractTitle = "COLLABORATIVE RESEARCH AGREEMENT";
        b.contractSubtitle = "AI-Driven Drug Discovery \u2014 Joint Development Program";
        b.contractNo = "ML-CRA-2026-00041";
        b.parties = new String[]{"lab", "partner"};
        b.partyLabels = new String[]{"Research Institution", "Industry Partner"};
        b.partyNames = new String[]{"Prof. Dr. Yuki Tanaka", "Dr. Maximilian Gruber"};
        b.partyCompanies = new String[]{"Mosaic Labs GmbH", "PharmaNord Biopharma AG"};
        b.partyEmails = new String[]{"y.tanaka@mosaic-labs.eu", "m.gruber@pharmanord.com"};
        b.sections = new String[]{"RESEARCH PROGRAM", "FUNDING AND RESOURCES", "INTELLECTUAL PROPERTY", "PUBLICATION AND CONFIDENTIALITY"};
        b.sectionText = new String[][]{
                {"The parties agree to collaborate on a 36-month research program applying machine learning and generative AI models to accelerate lead compound identification for oncology targets. Mosaic Labs contributes its proprietary ATLAS platform (molecular graph neural network) and computational infrastructure. PharmaNord provides target biology expertise, compound libraries, and in-vitro screening capabilities.",
                        "The program covers three work packages: WP1 — Model training on PharmaNord's historical screening data, WP2 — Virtual screening of 50M+ compounds against 5 validated targets, WP3 — Experimental validation of top 200 AI-predicted candidates."},
                {"Total program budget: EUR 4,200,000, funded 60% by PharmaNord (EUR 2,520,000) and 40% by Mosaic Labs (in-kind: compute, personnel, platform access). PharmaNord payments are milestone-based: EUR 840,000 at kick-off, followed by quarterly payments tied to deliverables per the project plan in Appendix A."},
                {"Background IP remains with each party. Foreground IP generated jointly shall be co-owned. PharmaNord receives an exclusive license to foreground IP for pharmaceutical applications. Mosaic Labs retains rights for non-pharmaceutical applications and platform improvements. Patent filing costs are shared equally; prosecution is led by PharmaNord's patent counsel."},
                {"Results may be published after a 90-day review period during which the other party may request redaction of confidential information or delay for patent filing. Confidential information exchanged under this agreement is protected for 5 years from disclosure. GDPR-compliant data handling protocols per Schedule D."}
        };
        return b;
    }

    // --- 12. Nexus Group ---
    private static Brand createNexus() {
        Brand b = new Brand("nexus");
        b.name = "Nexus Group";
        b.subtitle = "Venture Capital \u2022 M&A Advisory \u2022 Growth Partners";
        b.primary = hex("#1B3A5C"); b.accent = hex("#C9963A"); b.dark = hex("#0F2440");
        b.contractTitle = "SERIES B INVESTMENT TERM SHEET";
        b.contractSubtitle = "Preferred Equity Financing \u2014 Growth Round";
        b.contractNo = "NX-TS-2026-00017";
        b.parties = new String[]{"investor", "founder"};
        b.partyLabels = new String[]{"Lead Investor", "Company / Founder"};
        b.partyNames = new String[]{"Alexander Reinhardt", "Dipl.-Inf. Sven Karlsson"};
        b.partyCompanies = new String[]{"Nexus Group Capital Partners", "DataForge AI GmbH"};
        b.partyEmails = new String[]{"a.reinhardt@nexus-group.com", "s.karlsson@dataforge.ai"};
        b.sections = new String[]{"INVESTMENT TERMS", "GOVERNANCE AND BOARD", "LIQUIDATION PREFERENCE", "ANTI-DILUTION AND PROTECTIVE PROVISIONS"};
        b.sectionText = new String[][]{
                {"Nexus Group Capital Partners (\"Lead Investor\") agrees to invest EUR 15,000,000 in Series B Preferred Shares of DataForge AI GmbH at a pre-money valuation of EUR 60,000,000. The round targets EUR 22,000,000 total, with co-investors to be identified by the Lead Investor. Price per share: EUR 48.20 (based on 1,244,813 Series B shares). The investment is subject to satisfactory completion of legal and financial due diligence."},
                {"The Board of Directors shall consist of 5 members: 2 appointed by Series B investors, 2 by founders/common shareholders, and 1 independent member mutually agreed upon. Board observer rights for investors holding > 5% of Series B shares. Protective provisions require investor majority consent for: new share issuances, debt > EUR 2M, M&A transactions, executive compensation changes, and dividend declarations."},
                {"Series B shareholders hold a 1x non-participating liquidation preference. In a liquidation event, Series B holders receive the greater of: (a) their original investment plus 6% annual cumulative dividend, or (b) their pro-rata share on an as-converted basis. Deemed liquidation events include change of control and asset sale exceeding 50% of company assets."},
                {"Broad-based weighted average anti-dilution protection applies to down rounds. Pay-to-play provision: investors who do not participate pro-rata in future qualified rounds (> EUR 5M) will have their Series B shares automatically converted to common shares. Drag-along rights: if holders of 70% of preferred shares approve a sale, all shareholders must participate on the same terms. Tag-along rights: founders may co-sell shares in any secondary transaction by an investor."}
        };
        return b;
    }
}
