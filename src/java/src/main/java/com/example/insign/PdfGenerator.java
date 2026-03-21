package com.example.insign;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;

/**
 * Generates a simple test PDF with two inSign signature tags (SIG tags).
 *
 * SIG tags are invisible text markers that inSign detects during document processing.
 * Format: ##SIG{role:'RoleName',displayname:'Label',required:true,w:'Xcm',h:'Ycm',y:'-Ycm'}
 *
 * The generated PDF contains:
 * - A title and contract text
 * - SIG tag for Role "Signer1" (required)
 * - SIG tag for Role "Signer2" (required)
 */
@Component
public class PdfGenerator {

    /**
     * Generates a test PDF with 2 signature fields for 2 different roles.
     * Both fields are marked as required.
     */
    public byte[] generateTestPdf() throws Exception {
        try (PDDocument doc = new PDDocument()) {
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);

            PDType1Font fontBold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
            PDType1Font fontRegular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);

            try (PDPageContentStream cs = new PDPageContentStream(doc, page)) {
                // Title
                cs.beginText();
                cs.setFont(fontBold, 18);
                cs.newLineAtOffset(60, 750);
                cs.showText("Sample Contract - Getting Started");
                cs.endText();

                // Body text
                cs.beginText();
                cs.setFont(fontRegular, 11);
                cs.setLeading(16f);
                cs.newLineAtOffset(60, 710);
                cs.showText("This is a sample document for demonstrating the inSign API.");
                cs.newLine();
                cs.showText("It contains two signature fields assigned to two different roles.");
                cs.newLine();
                cs.newLine();
                cs.showText("Both parties agree to the terms outlined in this document.");
                cs.newLine();
                cs.showText("Please sign below to confirm your acceptance.");
                cs.endText();

                // Signature area labels
                cs.beginText();
                cs.setFont(fontBold, 12);
                cs.newLineAtOffset(60, 580);
                cs.showText("Signer 1:");
                cs.endText();

                cs.beginText();
                cs.setFont(fontBold, 12);
                cs.newLineAtOffset(320, 580);
                cs.showText("Signer 2:");
                cs.endText();

                // Signature boxes (visual guides)
                cs.setLineWidth(0.5f);
                cs.addRect(60, 500, 200, 70);
                cs.stroke();
                cs.addRect(320, 500, 200, 70);
                cs.stroke();

                // SIG tags - these are the markers inSign will detect
                // Format: ##SIG{role:'...',displayname:'...',required:true,w:'Xcm',h:'Ycm',y:'-Ycm'}
                // Using font size 0.5 to make them nearly invisible
                float sigWidthCm = 7.1f;  // ~200pt
                float sigHeightCm = 2.5f; // ~70pt

                cs.beginText();
                cs.setFont(fontRegular, 0.5f);
                cs.newLineAtOffset(60, 499);
                cs.showText("##SIG{role:'Signer1',displayname:'Signer 1',required:true,"
                        + "w:'" + sigWidthCm + "cm',h:'" + sigHeightCm + "cm',"
                        + "y:'-" + sigHeightCm + "cm'}");
                cs.endText();

                cs.beginText();
                cs.setFont(fontRegular, 0.5f);
                cs.newLineAtOffset(320, 499);
                cs.showText("##SIG{role:'Signer2',displayname:'Signer 2',required:true,"
                        + "w:'" + sigWidthCm + "cm',h:'" + sigHeightCm + "cm',"
                        + "y:'-" + sigHeightCm + "cm'}");
                cs.endText();

                // Date line
                cs.beginText();
                cs.setFont(fontRegular, 10);
                cs.newLineAtOffset(60, 460);
                cs.showText("Date: _______________");
                cs.endText();
            }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            doc.save(baos);
            return baos.toByteArray();
        }
    }
}
