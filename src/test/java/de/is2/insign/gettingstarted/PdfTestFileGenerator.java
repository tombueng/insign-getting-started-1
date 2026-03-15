package de.is2.insign.gettingstarted;

import org.apache.pdfbox.pdmodel.*;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.interactive.annotation.PDAnnotationWidget;
import org.apache.pdfbox.pdmodel.interactive.form.PDAcroForm;
import org.apache.pdfbox.pdmodel.interactive.form.PDSignatureField;

import java.io.*;
import java.nio.file.*;

/**
 * Generates two test PDF documents for inSign API demos:
 * 1. contract-sigfields.pdf  — with real AcroForm signature fields (roles: seller, buyer)
 * 2. contract-sigtags.pdf    — with inSign SIG-tag text markers instead
 *
 * Also writes demo-data.json with the fictive person/car data used in the contracts.
 *
 * Usage: run main() — outputs go to docs/data/
 */
public class PdfTestFileGenerator {

    // --- Fonts (built-in, zero embedding cost) ---
    private static final PDType1Font HELVETICA = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDType1Font HELVETICA_BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
    private static final PDType1Font HELVETICA_OBLIQUE = new PDType1Font(Standard14Fonts.FontName.HELVETICA_OBLIQUE);

    // --- Page geometry ---
    private static final float PAGE_WIDTH = PDRectangle.A4.getWidth();   // 595
    private static final float PAGE_HEIGHT = PDRectangle.A4.getHeight(); // 842
    private static final float MARGIN_LEFT = 60;
    private static final float MARGIN_RIGHT = 60;
    private static final float CONTENT_WIDTH = PAGE_WIDTH - MARGIN_LEFT - MARGIN_RIGHT;
    private static final float LINE_HEIGHT = 14;
    private static final float SECTION_GAP = 10;

    // --- Output paths (relative to project root) ---
    private static final String OUTPUT_DIR = "docs/data";
    private static final String LOGO_PATH = "DEV/inSign_logo.png";

    // --- Fictive data ---
    static final String SELLER_NAME = "Hans Mueller";
    static final String SELLER_EMAIL = "hans.mueller@example.com";
    static final String SELLER_PHONE = "+49 100 0000001";
    static final String SELLER_ADDRESS = "Musterstrasse 12, 80331 Munich, Germany";

    static final String BUYER_NAME = "Maria Schmidt";
    static final String BUYER_EMAIL = "maria.schmidt@example.com";
    static final String BUYER_PHONE = "+49 100 0000002";
    static final String BUYER_ADDRESS = "Lindenweg 5, 10115 Berlin, Germany";

    static final String CAR_MAKE = "BMW";
    static final String CAR_MODEL = "320i";
    static final int CAR_YEAR = 2021;
    static final String CAR_VIN = "WBA8E9C50HK123456";
    static final double CAR_PRICE = 38500.00;
    static final String CAR_CURRENCY = "EUR";
    static final String CAR_COLOR = "Alpine White";
    static final int CAR_MILEAGE = 45000;

    static final String CONTRACT_DATE = "March 13, 2026";
    static final String CONTRACT_LOCATION = "Munich, Germany";

    // --- Fictive data: Street Work Contract ---
    static final String BROKER_NAME = "Thomas Weber";
    static final String BROKER_EMAIL = "thomas.weber@immo-weber.de";
    static final String BROKER_PHONE = "+49 100 0000003";
    static final String BROKER_ADDRESS = "Leopoldstrasse 42, 80802 Munich, Germany";
    static final String BROKER_COMPANY = "Weber Immobilien & Bau GmbH";

    static final String CUSTOMER_NAME = "Claudia Fischer";
    static final String CUSTOMER_EMAIL = "claudia.fischer@example.com";
    static final String CUSTOMER_PHONE = "+49 100 0000004";
    static final String CUSTOMER_ADDRESS = "Rosenheimer Strasse 88, 81669 Munich, Germany";

    static final String AGENCY_NAME = "Stefan Lang";
    static final String AGENCY_EMAIL = "s.lang@strassen-bau-bayern.de";
    static final String AGENCY_PHONE = "+49 100 0000005";
    static final String AGENCY_ADDRESS = "Industriestrasse 15, 85748 Garching, Germany";
    static final String AGENCY_COMPANY = "Bayerische Strassenbau AG";

    static final String STREET_PROJECT_NAME = "Resurfacing and Drainage Upgrade — Amselweg";
    static final String STREET_PROJECT_ID = "STR-2026-00198";
    static final String STREET_LOCATION = "Amselweg 1-24, 82031 Gruenwald, Germany";
    static final String STREET_SCOPE = "Full road resurfacing (approx. 620 m), installation of new storm drains, " +
            "kerb replacement, and temporary traffic management for the duration of the works.";
    static final String STREET_START_DATE = "April 14, 2026";
    static final String STREET_END_DATE = "July 31, 2026";
    static final double STREET_CONTRACT_VALUE = 274800.00;
    static final String STREET_CURRENCY = "EUR";
    static final String STREET_CONTRACT_DATE = "March 14, 2026";
    static final String STREET_CONTRACT_LOCATION = "Munich, Germany";

    // =====================================================================

    public static void main(String[] args) throws Exception {
        Path outDir = Paths.get(OUTPUT_DIR);
        Files.createDirectories(outDir);

        generatePdf(outDir.resolve("contract-sigfields.pdf").toString(), false);
        generatePdf(outDir.resolve("contract-sigtags.pdf").toString(), true);
        generateStreetWorkPdf(outDir.resolve("street-work-sigfields.pdf").toString(), false);
        generateStreetWorkPdf(outDir.resolve("street-work-sigtags.pdf").toString(), true);
        writeJson(outDir.resolve("demo-data.json").toString());

        System.out.println("Generated files in " + outDir.toAbsolutePath());
    }

    // =====================================================================
    // PDF generation
    // =====================================================================

    private static void generatePdf(String outputPath, boolean useSigTags) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            // --- Info dictionary ---
            PDDocumentInformation info = doc.getDocumentInformation();
            info.setTitle("Vehicle Sale and Purchase Agreement");
            info.setAuthor("inSign Demo");
            info.setSubject("Car Sale Contract — " + CAR_MAKE + " " + CAR_MODEL);
            info.setCreator("Apache PDFBox / inSign Getting Started");
            info.setKeywords("insign, demo, contract, signature");

            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);

            float y; // current vertical position (top-down)

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                y = PAGE_HEIGHT - 40;

                // --- Logo ---
                y = drawLogo(doc, cs, y);

                // --- Title ---
                y -= 10;
                y = drawCenteredText(cs, "VEHICLE SALE AND PURCHASE AGREEMENT", HELVETICA_BOLD, 16, y);
                y -= 6;
                y = drawCenteredText(cs, "Contract No. INS-2026-00471", HELVETICA, 9, y);
                y -= 4;
                y = drawLine(cs, y);

                // --- Section 1: Parties ---
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "1. CONTRACTING PARTIES", y);
                y -= 4;
                y = drawText(cs, "Seller:", HELVETICA_BOLD, 10, y);
                y = drawText(cs, SELLER_NAME, HELVETICA, 10, y);
                y = drawText(cs, SELLER_ADDRESS, HELVETICA, 9, y);
                y = drawText(cs, "Email: " + SELLER_EMAIL + "  |  Phone: " + SELLER_PHONE, HELVETICA, 9, y);
                y -= 6;
                y = drawText(cs, "Buyer:", HELVETICA_BOLD, 10, y);
                y = drawText(cs, BUYER_NAME, HELVETICA, 10, y);
                y = drawText(cs, BUYER_ADDRESS, HELVETICA, 9, y);
                y = drawText(cs, "Email: " + BUYER_EMAIL + "  |  Phone: " + BUYER_PHONE, HELVETICA, 9, y);

                // --- Section 2: Vehicle ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "2. VEHICLE DESCRIPTION", y);
                y -= 4;
                y = drawKeyValue(cs, "Make / Model:", CAR_MAKE + " " + CAR_MODEL + " (" + CAR_YEAR + ")", y);
                y = drawKeyValue(cs, "VIN:", CAR_VIN, y);
                y = drawKeyValue(cs, "Color:", CAR_COLOR, y);
                y = drawKeyValue(cs, "Mileage:", String.format("%,d km", CAR_MILEAGE), y);
                y = drawKeyValue(cs, "Purchase Price:", String.format("%,.2f %s", CAR_PRICE, CAR_CURRENCY), y);

                // --- Section 3: Terms ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "3. TERMS AND CONDITIONS", y);
                y -= 4;
                y = drawParagraph(cs,
                        "The Seller hereby agrees to sell and transfer ownership of the above-described vehicle " +
                        "to the Buyer, and the Buyer agrees to purchase the vehicle for the stated price. " +
                        "The vehicle is sold in its current condition (\"as-is\"). The Seller warrants that the vehicle " +
                        "is free of any liens, claims, or encumbrances.", y);
                y -= 6;
                y = drawParagraph(cs,
                        "Payment shall be made in full via bank transfer within 5 business days of signing this " +
                        "agreement. Title and registration documents will be transferred upon receipt of payment. " +
                        "The Buyer acknowledges having inspected the vehicle and accepts it in its present state.", y);

                // --- Section 4: Applicable Law ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "4. GOVERNING LAW", y);
                y -= 4;
                y = drawParagraph(cs,
                        "This agreement shall be governed by and construed in accordance with the laws of the " +
                        "Federal Republic of Germany. Any disputes arising from this contract shall be subject to " +
                        "the jurisdiction of the courts in Munich.", y);

                // --- Section 5: Signatures ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "5. SIGNATURES", y);
                y -= 4;
                y = drawText(cs, "Place and Date: " + CONTRACT_LOCATION + ", " + CONTRACT_DATE, HELVETICA, 9, y);
                y -= 6;
                y = drawText(cs, "By signing below, both parties confirm that they have read, understood, and agree", HELVETICA, 9, y);
                y = drawText(cs, "to all terms and conditions set forth in this agreement.", HELVETICA, 9, y);
                y -= 16;

                // --- Signature area labels ---
                float sigY = y;
                float sigWidth = 200;
                float sigHeight = 60;
                float sellerX = MARGIN_LEFT;
                float buyerX = PAGE_WIDTH - MARGIN_RIGHT - sigWidth;

                // Labels above signature areas
                drawTextAt(cs, "Seller: " + SELLER_NAME, HELVETICA_BOLD, 9, sellerX, sigY + 2);
                drawTextAt(cs, "Buyer: " + BUYER_NAME, HELVETICA_BOLD, 9, buyerX, sigY + 2);

                if (useSigTags) {
                    // --- SIG-TAGS variant ---
                    // Render the SIG-tag strings as tiny gray text inside the signature areas
                    float tagY = sigY - 30;
                    cs.setNonStrokingColor(0.7f, 0.7f, 0.7f);
                    drawTextAt(cs, "##SIG{role:'seller',displayname:'Seller',required:true,w:'50mm',h:'15mm'}",
                            HELVETICA, 6, sellerX, tagY);
                    drawTextAt(cs, "##SIG{role:'buyer',displayname:'Buyer',required:true,w:'50mm',h:'15mm'}",
                            HELVETICA, 6, buyerX, tagY);
                    cs.setNonStrokingColor(0, 0, 0);
                } else {
                    // Draw dotted-line placeholder boxes for visual reference
                    cs.setStrokingColor(0.6f, 0.6f, 0.6f);
                    cs.setLineDashPattern(new float[]{3, 3}, 0);
                    cs.addRect(sellerX, sigY - sigHeight, sigWidth, sigHeight);
                    cs.addRect(buyerX, sigY - sigHeight, sigWidth, sigHeight);
                    cs.stroke();
                    cs.setLineDashPattern(new float[]{}, 0);
                    cs.setStrokingColor(0, 0, 0);
                }

                // Footer
                float footerY = 30;
                cs.setNonStrokingColor(0.5f, 0.5f, 0.5f);
                drawTextAt(cs, "Generated by inSign Getting Started Demo  —  getinsign.com", HELVETICA_OBLIQUE, 7,
                        MARGIN_LEFT, footerY);
                cs.setNonStrokingColor(0, 0, 0);

            } // content stream closed

            // --- AcroForm signature fields (only for sigfields variant) ---
            if (!useSigTags) {
                float sigY = 0;
                // We need to recalculate the signature Y position.
                // Since we drew it during the content stream, let's use a known position.
                // The signature boxes are drawn at approximately y=sigY-sigHeight from content stream.
                // We'll estimate based on typical content length. For robustness, use a fixed position.
                float sigFieldY = 115; // approximate Y in PDF coords (from bottom)
                float sigWidth = 200;
                float sigHeight = 60;
                float sellerX = MARGIN_LEFT;
                float buyerX = PAGE_WIDTH - MARGIN_RIGHT - sigWidth;

                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);

                addSignatureField(doc, acroForm, page, "seller", "Seller",
                        sellerX, sigFieldY, sigWidth, sigHeight);
                addSignatureField(doc, acroForm, page, "buyer", "Buyer",
                        buyerX, sigFieldY, sigWidth, sigHeight);
            }

            doc.save(outputPath);
            File f = new File(outputPath);
            System.out.printf("  %s  (%,d bytes)%n", outputPath, f.length());
        }
    }

    // =====================================================================
    // Street Work Contract PDF
    // =====================================================================

    private static void generateStreetWorkPdf(String outputPath, boolean useSigTags) throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDDocumentInformation info = doc.getDocumentInformation();
            info.setTitle("Street Work Services Contract");
            info.setAuthor("inSign Demo");
            info.setSubject("Street Work Contract — " + STREET_PROJECT_ID);
            info.setCreator("Apache PDFBox / inSign Getting Started");
            info.setKeywords("insign, demo, contract, signature, street work");

            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);

            float y;

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                y = PAGE_HEIGHT - 40;

                // --- Logo ---
                y = drawLogo(doc, cs, y);

                // --- Title ---
                y -= 10;
                y = drawCenteredText(cs, "STREET WORK SERVICES CONTRACT", HELVETICA_BOLD, 16, y);
                y -= 6;
                y = drawCenteredText(cs, "Project No. " + STREET_PROJECT_ID, HELVETICA, 9, y);
                y -= 4;
                y = drawLine(cs, y);

                // --- Section 1: Parties ---
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "1. CONTRACTING PARTIES", y);
                y -= 4;
                y = drawText(cs, "Broker:", HELVETICA_BOLD, 10, y);
                y = drawText(cs, BROKER_NAME + "  (" + BROKER_COMPANY + ")", HELVETICA, 10, y);
                y = drawText(cs, BROKER_ADDRESS, HELVETICA, 9, y);
                y = drawText(cs, "Email: " + BROKER_EMAIL + "  |  Phone: " + BROKER_PHONE, HELVETICA, 9, y);
                y -= 6;
                y = drawText(cs, "Customer (Principal):", HELVETICA_BOLD, 10, y);
                y = drawText(cs, CUSTOMER_NAME, HELVETICA, 10, y);
                y = drawText(cs, CUSTOMER_ADDRESS, HELVETICA, 9, y);
                y = drawText(cs, "Email: " + CUSTOMER_EMAIL + "  |  Phone: " + CUSTOMER_PHONE, HELVETICA, 9, y);
                y -= 6;
                y = drawText(cs, "Agency (Contractor):", HELVETICA_BOLD, 10, y);
                y = drawText(cs, AGENCY_NAME + "  (" + AGENCY_COMPANY + ")", HELVETICA, 10, y);
                y = drawText(cs, AGENCY_ADDRESS, HELVETICA, 9, y);
                y = drawText(cs, "Email: " + AGENCY_EMAIL + "  |  Phone: " + AGENCY_PHONE, HELVETICA, 9, y);

                // --- Section 2: Project Description ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "2. PROJECT DESCRIPTION", y);
                y -= 4;
                y = drawKeyValue(cs, "Project:", STREET_PROJECT_NAME, y);
                y = drawKeyValue(cs, "Location:", STREET_LOCATION, y);
                y = drawKeyValue(cs, "Start Date:", STREET_START_DATE, y);
                y = drawKeyValue(cs, "End Date:", STREET_END_DATE, y);
                y = drawKeyValue(cs, "Contract Value:", String.format("%,.2f %s", STREET_CONTRACT_VALUE, STREET_CURRENCY), y);
                y -= 4;
                y = drawText(cs, "Scope of Works:", HELVETICA_BOLD, 10, y);
                y = drawParagraph(cs, STREET_SCOPE, y);

                // --- Section 3: Terms ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "3. TERMS AND CONDITIONS", y);
                y -= 4;
                y = drawParagraph(cs,
                        "The Agency (Contractor) agrees to perform the street works described above in accordance " +
                        "with all applicable municipal regulations and safety standards. The Broker has arranged this " +
                        "contract on behalf of the Customer and shall oversee project milestones and payment schedules.", y);
                y -= 6;
                y = drawParagraph(cs,
                        "Payment shall be made in three instalments: 30% upon commencement, 40% at mid-project " +
                        "inspection, and 30% upon final acceptance. The Contractor shall maintain adequate insurance " +
                        "coverage and shall be liable for any damage caused to adjacent properties during the works.", y);

                // --- Section 4: Governing Law ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "4. GOVERNING LAW", y);
                y -= 4;
                y = drawParagraph(cs,
                        "This contract shall be governed by the laws of the Federal Republic of Germany. " +
                        "Any disputes shall be resolved under the jurisdiction of the courts in Munich.", y);

                // --- Section 5: Signatures ---
                y -= SECTION_GAP;
                y = drawLine(cs, y);
                y -= SECTION_GAP;
                y = drawSectionTitle(cs, "5. SIGNATURES", y);
                y -= 4;
                y = drawText(cs, "Place and Date: " + STREET_CONTRACT_LOCATION + ", " + STREET_CONTRACT_DATE,
                        HELVETICA, 9, y);
                y -= 6;
                y = drawText(cs, "By signing below, all parties confirm that they have read, understood, and agree",
                        HELVETICA, 9, y);
                y = drawText(cs, "to all terms and conditions set forth in this contract.", HELVETICA, 9, y);
                y -= 16;

                // --- Signature areas (3 columns) ---
                float sigY = y;
                float sigWidth = 145;
                float sigHeight = 50;
                float brokerX = MARGIN_LEFT;
                float customerX = MARGIN_LEFT + (CONTENT_WIDTH - sigWidth) / 2;
                float agencyX = PAGE_WIDTH - MARGIN_RIGHT - sigWidth;

                drawTextAt(cs, "Broker: " + BROKER_NAME, HELVETICA_BOLD, 8, brokerX, sigY + 2);
                drawTextAt(cs, "Customer: " + CUSTOMER_NAME, HELVETICA_BOLD, 8, customerX, sigY + 2);
                drawTextAt(cs, "Agency: " + AGENCY_NAME, HELVETICA_BOLD, 8, agencyX, sigY + 2);

                if (useSigTags) {
                    float tagY = sigY - 25;
                    cs.setNonStrokingColor(0.7f, 0.7f, 0.7f);
                    drawTextAt(cs, "##SIG{role:'broker',displayname:'Broker',required:true,w:'38mm',h:'13mm'}",
                            HELVETICA, 5, brokerX, tagY);
                    drawTextAt(cs, "##SIG{role:'customer',displayname:'Customer',required:true,w:'38mm',h:'13mm'}",
                            HELVETICA, 5, customerX, tagY);
                    drawTextAt(cs, "##SIG{role:'agency',displayname:'Agency',required:true,w:'38mm',h:'13mm'}",
                            HELVETICA, 5, agencyX, tagY);
                    cs.setNonStrokingColor(0, 0, 0);
                } else {
                    cs.setStrokingColor(0.6f, 0.6f, 0.6f);
                    cs.setLineDashPattern(new float[]{3, 3}, 0);
                    cs.addRect(brokerX, sigY - sigHeight, sigWidth, sigHeight);
                    cs.addRect(customerX, sigY - sigHeight, sigWidth, sigHeight);
                    cs.addRect(agencyX, sigY - sigHeight, sigWidth, sigHeight);
                    cs.stroke();
                    cs.setLineDashPattern(new float[]{}, 0);
                    cs.setStrokingColor(0, 0, 0);
                }

                // Footer
                float footerY = 30;
                cs.setNonStrokingColor(0.5f, 0.5f, 0.5f);
                drawTextAt(cs, "Generated by inSign Getting Started Demo  —  getinsign.com", HELVETICA_OBLIQUE, 7,
                        MARGIN_LEFT, footerY);
                cs.setNonStrokingColor(0, 0, 0);
            }

            // --- AcroForm signature fields (only for sigfields variant) ---
            if (!useSigTags) {
                float sigFieldY = 95;
                float sigWidth = 145;
                float sigHeight = 50;
                float brokerX = MARGIN_LEFT;
                float customerX = MARGIN_LEFT + (CONTENT_WIDTH - sigWidth) / 2;
                float agencyX = PAGE_WIDTH - MARGIN_RIGHT - sigWidth;

                PDAcroForm acroForm = new PDAcroForm(doc);
                doc.getDocumentCatalog().setAcroForm(acroForm);

                addSignatureField(doc, acroForm, page, "broker", "Broker",
                        brokerX, sigFieldY, sigWidth, sigHeight);
                addSignatureField(doc, acroForm, page, "customer", "Customer",
                        customerX, sigFieldY, sigWidth, sigHeight);
                addSignatureField(doc, acroForm, page, "agency", "Agency",
                        agencyX, sigFieldY, sigWidth, sigHeight);
            }

            doc.save(outputPath);
            File f = new File(outputPath);
            System.out.printf("  %s  (%,d bytes)%n", outputPath, f.length());
        }
    }

    // =====================================================================
    // AcroForm signature field creation
    // =====================================================================

    private static void addSignatureField(PDDocument doc, PDAcroForm acroForm, PDPage page,
                                          String fieldName, String displayName,
                                          float x, float y, float w, float h) throws IOException {
        PDSignatureField sigField = new PDSignatureField(acroForm);
        sigField.setPartialName(fieldName);
        sigField.setAlternateFieldName(displayName);

        PDAnnotationWidget widget = sigField.getWidgets().get(0);
        widget.setRectangle(new PDRectangle(x, y, w, h));
        widget.setPage(page);
        page.getAnnotations().add(widget);

        acroForm.getFields().add(sigField);
    }

    // =====================================================================
    // Drawing helpers
    // =====================================================================

    private static float drawLogo(PDDocument doc, PDPageContentStream cs, float y) throws IOException {
        File logoFile = new File(LOGO_PATH);
        if (logoFile.exists()) {
            PDImageXObject logo = PDImageXObject.createFromFileByContent(logoFile, doc);
            float logoWidth = 140;
            float logoHeight = logoWidth * logo.getHeight() / logo.getWidth();
            cs.drawImage(logo, MARGIN_LEFT, y - logoHeight, logoWidth, logoHeight);
            return y - logoHeight - 8;
        }
        return y - 20;
    }

    private static float drawCenteredText(PDPageContentStream cs, String text,
                                          PDType1Font font, float fontSize, float y) throws IOException {
        float textWidth = font.getStringWidth(text) / 1000 * fontSize;
        float x = (PAGE_WIDTH - textWidth) / 2;
        cs.beginText();
        cs.setFont(font, fontSize);
        cs.newLineAtOffset(x, y);
        cs.showText(text);
        cs.endText();
        return y - fontSize - 2;
    }

    private static float drawSectionTitle(PDPageContentStream cs, String text, float y) throws IOException {
        cs.beginText();
        cs.setFont(HELVETICA_BOLD, 11);
        cs.newLineAtOffset(MARGIN_LEFT, y);
        cs.showText(text);
        cs.endText();
        return y - LINE_HEIGHT;
    }

    private static float drawText(PDPageContentStream cs, String text,
                                  PDType1Font font, float fontSize, float y) throws IOException {
        cs.beginText();
        cs.setFont(font, fontSize);
        cs.newLineAtOffset(MARGIN_LEFT, y);
        cs.showText(text);
        cs.endText();
        return y - LINE_HEIGHT;
    }

    private static void drawTextAt(PDPageContentStream cs, String text,
                                   PDType1Font font, float fontSize,
                                   float x, float y) throws IOException {
        cs.beginText();
        cs.setFont(font, fontSize);
        cs.newLineAtOffset(x, y);
        cs.showText(text);
        cs.endText();
    }

    private static float drawKeyValue(PDPageContentStream cs, String key, String value, float y) throws IOException {
        float keyWidth = 110;
        cs.beginText();
        cs.setFont(HELVETICA_BOLD, 10);
        cs.newLineAtOffset(MARGIN_LEFT, y);
        cs.showText(key);
        cs.endText();
        cs.beginText();
        cs.setFont(HELVETICA, 10);
        cs.newLineAtOffset(MARGIN_LEFT + keyWidth, y);
        cs.showText(value);
        cs.endText();
        return y - LINE_HEIGHT;
    }

    private static float drawParagraph(PDPageContentStream cs, String text, float y) throws IOException {
        float fontSize = 9;
        float maxWidth = CONTENT_WIDTH;
        String[] words = text.split("\\s+");
        StringBuilder line = new StringBuilder();

        cs.setFont(HELVETICA, fontSize);

        for (String word : words) {
            String testLine = line.length() == 0 ? word : line + " " + word;
            float testWidth = HELVETICA.getStringWidth(testLine) / 1000 * fontSize;
            if (testWidth > maxWidth && line.length() > 0) {
                cs.beginText();
                cs.newLineAtOffset(MARGIN_LEFT, y);
                cs.showText(line.toString());
                cs.endText();
                y -= LINE_HEIGHT;
                line = new StringBuilder(word);
            } else {
                line = new StringBuilder(testLine);
            }
        }
        if (line.length() > 0) {
            cs.beginText();
            cs.newLineAtOffset(MARGIN_LEFT, y);
            cs.showText(line.toString());
            cs.endText();
            y -= LINE_HEIGHT;
        }
        return y;
    }

    private static float drawLine(PDPageContentStream cs, float y) throws IOException {
        cs.setStrokingColor(0.8f, 0.8f, 0.8f);
        cs.setLineWidth(0.5f);
        cs.moveTo(MARGIN_LEFT, y);
        cs.lineTo(PAGE_WIDTH - MARGIN_RIGHT, y);
        cs.stroke();
        cs.setStrokingColor(0, 0, 0);
        return y;
    }

    // =====================================================================
    // JSON output
    // =====================================================================

    private static void writeJson(String outputPath) throws IOException {
        String json = "{\n" +
                "  \"seller\": {\n" +
                "    \"name\": \"" + SELLER_NAME + "\",\n" +
                "    \"email\": \"" + SELLER_EMAIL + "\",\n" +
                "    \"phone\": \"" + SELLER_PHONE + "\",\n" +
                "    \"address\": \"" + SELLER_ADDRESS + "\"\n" +
                "  },\n" +
                "  \"buyer\": {\n" +
                "    \"name\": \"" + BUYER_NAME + "\",\n" +
                "    \"email\": \"" + BUYER_EMAIL + "\",\n" +
                "    \"phone\": \"" + BUYER_PHONE + "\",\n" +
                "    \"address\": \"" + BUYER_ADDRESS + "\"\n" +
                "  },\n" +
                "  \"car\": {\n" +
                "    \"make\": \"" + CAR_MAKE + "\",\n" +
                "    \"model\": \"" + CAR_MODEL + "\",\n" +
                "    \"year\": " + CAR_YEAR + ",\n" +
                "    \"vin\": \"" + CAR_VIN + "\",\n" +
                "    \"price\": " + CAR_PRICE + ",\n" +
                "    \"currency\": \"" + CAR_CURRENCY + "\",\n" +
                "    \"color\": \"" + CAR_COLOR + "\",\n" +
                "    \"mileage_km\": " + CAR_MILEAGE + "\n" +
                "  },\n" +
                "  \"streetWorkContract\": {\n" +
                "    \"broker\": {\n" +
                "      \"name\": \"" + BROKER_NAME + "\",\n" +
                "      \"company\": \"" + BROKER_COMPANY + "\",\n" +
                "      \"email\": \"" + BROKER_EMAIL + "\",\n" +
                "      \"phone\": \"" + BROKER_PHONE + "\",\n" +
                "      \"address\": \"" + BROKER_ADDRESS + "\"\n" +
                "    },\n" +
                "    \"customer\": {\n" +
                "      \"name\": \"" + CUSTOMER_NAME + "\",\n" +
                "      \"email\": \"" + CUSTOMER_EMAIL + "\",\n" +
                "      \"phone\": \"" + CUSTOMER_PHONE + "\",\n" +
                "      \"address\": \"" + CUSTOMER_ADDRESS + "\"\n" +
                "    },\n" +
                "    \"agency\": {\n" +
                "      \"name\": \"" + AGENCY_NAME + "\",\n" +
                "      \"company\": \"" + AGENCY_COMPANY + "\",\n" +
                "      \"email\": \"" + AGENCY_EMAIL + "\",\n" +
                "      \"phone\": \"" + AGENCY_PHONE + "\",\n" +
                "      \"address\": \"" + AGENCY_ADDRESS + "\"\n" +
                "    },\n" +
                "    \"project\": {\n" +
                "      \"name\": \"" + STREET_PROJECT_NAME + "\",\n" +
                "      \"id\": \"" + STREET_PROJECT_ID + "\",\n" +
                "      \"location\": \"" + STREET_LOCATION + "\",\n" +
                "      \"startDate\": \"" + STREET_START_DATE + "\",\n" +
                "      \"endDate\": \"" + STREET_END_DATE + "\",\n" +
                "      \"value\": " + STREET_CONTRACT_VALUE + ",\n" +
                "      \"currency\": \"" + STREET_CURRENCY + "\"\n" +
                "    }\n" +
                "  }\n" +
                "}";
        Files.writeString(Paths.get(outputPath), json);
        System.out.println("  " + outputPath);
    }
}
