/* ==========================================================================
   PDF Viewer — Lightweight PDF preview using PDF.js from CDN
   Shows uploaded/downloaded documents in a modal with page navigation
   ========================================================================== */

window.PdfViewer = class PdfViewer {

    constructor() {
        this.pdfDoc = null;
        this.currentPage = 1;
        this.scale = 1.2;
        this.modal = null;
        this.$canvas = null;
        this.ctx = null;
        this.lib = null;
        this._loading = false;
        this._initModal();
    }

    _initModal() {
        // Create modal HTML
        const $modal = $(`
            <div class="modal fade" id="pdf-viewer-modal" tabindex="-1">
                <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                    <div class="modal-content" style="background:var(--insign-dark);border:none;border-radius:var(--insign-radius-card)">
                        <div class="modal-header" style="border-bottom:1px solid rgba(255,255,255,0.1);padding:8px 16px">
                            <span class="modal-title text-white" style="font-size:0.9rem" id="pdf-viewer-title">Document Preview</span>
                            <div class="d-flex align-items-center gap-2 ms-auto">
                                <button class="btn btn-sm btn-outline-light" id="pdf-zoom-out" title="Zoom out" style="padding:2px 8px">
                                    <i class="bi bi-zoom-out"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-light" id="pdf-zoom-in" title="Zoom in" style="padding:2px 8px">
                                    <i class="bi bi-zoom-in"></i>
                                </button>
                                <span class="text-white-50 mx-2" style="font-size:0.8rem" id="pdf-page-info">-</span>
                                <button class="btn btn-sm btn-outline-light" id="pdf-prev" title="Previous page" style="padding:2px 8px">
                                    <i class="bi bi-chevron-left"></i>
                                </button>
                                <button class="btn btn-sm btn-outline-light" id="pdf-next" title="Next page" style="padding:2px 8px">
                                    <i class="bi bi-chevron-right"></i>
                                </button>
                                <button type="button" class="btn-close btn-close-white ms-2" data-bs-dismiss="modal"></button>
                            </div>
                        </div>
                        <div class="modal-body text-center p-2" style="overflow:auto;max-height:80vh;background:#525659">
                            <div id="pdf-loading" style="display:none" class="py-5">
                                <div class="spinner-border text-light" role="status"></div>
                                <div class="text-white-50 mt-2" style="font-size:0.85rem">Loading PDF...</div>
                            </div>
                            <canvas id="pdf-canvas" style="max-width:100%;box-shadow:0 2px 12px rgba(0,0,0,0.4)"></canvas>
                            <div id="pdf-error" class="text-warning py-4" style="display:none"></div>
                        </div>
                        <div class="modal-footer" style="border-top:1px solid rgba(255,255,255,0.1);padding:6px 16px;justify-content:space-between">
                            <span class="text-white-50" style="font-size:0.75rem" id="pdf-file-info"></span>
                            <button type="button" class="btn btn-sm btn-outline-light" data-bs-dismiss="modal">Close</button>
                        </div>
                    </div>
                </div>
            </div>`);
        $('body').append($modal);

        this.modal = new bootstrap.Modal($('#pdf-viewer-modal')[0]);
        this.$canvas = $('#pdf-canvas');
        this.ctx = this.$canvas[0].getContext('2d');

        // Bind navigation
        $('#pdf-prev').on('click', () => this.prevPage());
        $('#pdf-next').on('click', () => this.nextPage());
        $('#pdf-zoom-in').on('click', () => this.zoom(0.2));
        $('#pdf-zoom-out').on('click', () => this.zoom(-0.2));
    }

    async _ensureLib() {
        if (this.lib) return;
        // Dynamically import PDF.js
        this.lib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.min.mjs');
        this.lib.GlobalWorkerOptions.workerSrc =
            'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.9.155/build/pdf.worker.min.mjs';
    }

    /**
     * Show a PDF in the viewer modal
     * @param {Blob|ArrayBuffer|Uint8Array|string} source - PDF data or URL
     * @param {Object} [opts] - Optional { title, fileSize }
     */
    async show(source, opts = {}) {
        this._showLoading(true);
        this.modal.show();

        $('#pdf-viewer-title').text(opts.title || 'Document Preview');
        $('#pdf-error').css('display', 'none');
        this.$canvas.css('display', 'none');

        try {
            await this._ensureLib();

            let data;
            if (source instanceof Blob) {
                data = await source.arrayBuffer();
            } else if (typeof source === 'string' && (source.startsWith('http') || source.startsWith('data/'))) {
                const resp = await fetch(source);
                data = await resp.arrayBuffer();
            } else {
                data = source;
            }

            this.pdfDoc = await this.lib.getDocument({ data }).promise;
            this.currentPage = 1;

            const info = [];
            if (this.pdfDoc.numPages) info.push(this.pdfDoc.numPages + ' page(s)');
            if (opts.fileSize) info.push(this._formatSize(opts.fileSize));
            $('#pdf-file-info').text(info.join(' \u2022 '));

            this._showLoading(false);
            this.$canvas.css('display', '');
            await this._renderPage();

        } catch (err) {
            this._showLoading(false);
            $('#pdf-error').css('display', '').text('Failed to load PDF: ' + err.message);
        }
    }

    async _renderPage() {
        if (!this.pdfDoc) return;
        const page = await this.pdfDoc.getPage(this.currentPage);
        const viewport = page.getViewport({ scale: this.scale });

        this.$canvas[0].width = viewport.width;
        this.$canvas[0].height = viewport.height;
        await page.render({ canvasContext: this.ctx, viewport }).promise;

        $('#pdf-page-info').text(this.currentPage + ' / ' + this.pdfDoc.numPages);
    }

    async prevPage() {
        if (this.currentPage > 1) {
            this.currentPage--;
            await this._renderPage();
        }
    }

    async nextPage() {
        if (this.pdfDoc && this.currentPage < this.pdfDoc.numPages) {
            this.currentPage++;
            await this._renderPage();
        }
    }

    async zoom(delta) {
        this.scale = Math.max(0.5, Math.min(3.0, this.scale + delta));
        if (this.pdfDoc) await this._renderPage();
    }

    _showLoading(show) {
        $('#pdf-loading').css('display', show ? '' : 'none');
    }

    _formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }
};
