// Initialize jsPDF with the global scope
let jsPDF = window.jspdf.jsPDF;

// Store original styles
let originalStyles = {};

// Function to prepare the document for PDF export
async function prepareForPdfExport() {
    // Store the original button state
    const exportBtn = document.getElementById('exportPdf');
    const originalText = exportBtn.innerHTML;
    exportBtn.disabled = true;
    exportBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Preparing export...';
    
    // Store the current filter state
    const currentFilter = document.querySelector('.list-group-item.active')?.dataset.filter || 'all';
    
    // Show loading state
    const loadingElement = document.getElementById('loading');
    const originalLoadingDisplay = loadingElement.style.display;
    loadingElement.style.display = 'block';
    
    try {
        // Create a style element for PDF export
        const style = document.createElement('style');
        style.id = 'pdf-export-styles';
        style.textContent = `
            body {
                background: #ffffff !important;
                color: #333333 !important;
                padding: 20px !important;
            }
            .container {
                max-width: 100% !important;
                padding: 0 !important;
            }
            .card {
                border: 1px solid #dee2e6 !important;
                margin-bottom: 1rem !important;
                break-inside: avoid;
            }
            .list-group-item {
                border: 1px solid rgba(0,0,0,.125) !important;
            }
            .badge {
                color: #fff !important;
            }
            #exportPdf, .btn-close, .modal, .modal-backdrop, .spinner-border {
                display: none !important;
            }
            #loading {
                display: none !important;
            }
        `;
        document.head.appendChild(style);
        
        // Get all registrations regardless of filter
        const allFilterButton = document.querySelector('[data-filter="all"]');
        if (allFilterButton && currentFilter !== 'all') {
            allFilterButton.click();
            // Wait for the content to update
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        return { 
            style, 
            originalText, 
            originalLoadingDisplay, 
            currentFilter 
        };
    } catch (error) {
        console.error('Error preparing for export:', error);
        throw error;
    }
}

// Function to restore original styles and button state
function restoreOriginalStyles(exportBtn, originalText, originalLoadingDisplay, currentFilter) {
    const style = document.getElementById('pdf-export-styles');
    if (style) {
        style.remove();
    }
    
    // Restore loading state
    const loadingElement = document.getElementById('loading');
    if (loadingElement) {
        loadingElement.style.display = originalLoadingDisplay || 'block';
    }
    
    // Restore the original filter if it was changed
    if (currentFilter && currentFilter !== 'all') {
        const filterButton = document.querySelector(`[data-filter="${currentFilter}"]`);
        if (filterButton) {
            filterButton.click();
        }
    }
    
    // Restore export button state
    if (exportBtn) {
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalText;
    }
}

// Add event listener for the export button
document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportPdf');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToPdf);
    }
});

async function exportToPdf() {
    const btn = document.getElementById('exportPdf');
    let originalBtnState = null;
    let prepResult = null;
    
    try {
        // Prepare document for PDF export
        prepResult = await prepareForPdfExport();
        originalBtnState = prepResult.originalText;
        
        // Update button to show current status
        btn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Exporting all registrations...';
        
        // Get all registration cards
        const registrationCards = document.querySelectorAll('.registration-card');
        if (registrationCards.length === 0) {
            throw new Error('No registration data found to export');
        }
        
        // Initialize PDF
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const margin = 15; // mm
        const contentWidth = pageWidth - (2 * margin);
        
        // Add title page
        pdf.setFontSize(20);
        pdf.text('AAA SUMMIT REGISTRATIONS', pageWidth / 2, 40, { align: 'center' });
        pdf.setFontSize(12);
        pdf.text(`Total Registrations: ${registrationCards.length}`, pageWidth / 2, 50, { align: 'center' });
        pdf.text(`Generated on: ${new Date().toLocaleString()}`, pageWidth / 2, 60, { align: 'center' });
        
        // Add a new page for the actual content
        pdf.addPage();
        
        let yPosition = margin;
        let currentPage = 1;
        
        // Process each registration card
        for (let i = 0; i < registrationCards.length; i++) {
            const card = registrationCards[i];
            
            // Create a temporary container for the card
            const tempContainer = document.createElement('div');
            tempContainer.className = 'pdf-card-container';
            tempStyle = `
                position: absolute;
                left: -10000px;
                width: ${contentWidth}mm;
                background: white;
                padding: 10px;
                box-sizing: border-box;
            `;
            tempContainer.style.cssText = tempStyle;
            
            // Clone the card to avoid modifying the original
            const cardClone = card.cloneNode(true);
            tempContainer.appendChild(cardClone);
            document.body.appendChild(tempContainer);
            
            try {
                // Convert card to canvas
                const canvas = await html2canvas(cardClone, {
                    scale: 2,
                    backgroundColor: '#ffffff',
                    logging: false,
                    useCORS: true,
                    allowTaint: true
                });
                
                // Calculate dimensions
                const imgData = canvas.toDataURL('image/png');
                const imgAspectRatio = canvas.width / canvas.height;
                const imgWidth = contentWidth;
                const imgHeight = imgWidth / imgAspectRatio;
                
                // Check if we need a new page
                if (yPosition + imgHeight > pageHeight - margin) {
                    pdf.addPage();
                    yPosition = margin;
                    currentPage++;
                }
                
                // Add image to PDF
                pdf.addImage({
                    imageData: imgData,
                    x: margin,
                    y: yPosition,
                    width: imgWidth,
                    height: imgHeight
                });
                
                yPosition += imgHeight + 5; // Add some space between cards
                
            } finally {
                // Clean up
                if (tempContainer.parentNode) {
                    tempContainer.parentNode.removeChild(tempContainer);
                }
            }
            
            // Update progress
            if (i % 5 === 0 || i === registrationCards.length - 1) {
                const progress = Math.round(((i + 1) / registrationCards.length) * 100);
                btn.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Exporting... ${progress}%`;
            }
        }
        
        // Add page numbers
        const pageCount = pdf.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            pdf.setPage(i);
            pdf.setFontSize(10);
            pdf.setTextColor(100);
            pdf.text(`Page ${i} of ${pageCount}`, pageWidth - margin, pageHeight - 10, { align: 'right' });
        }
        
        // Save the PDF
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        pdf.save(`AAA_Registrations_${timestamp}.pdf`);
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert(`Failed to generate PDF: ${error.message}`);
    } finally {
        // Restore original state
        if (btn) {
            restoreOriginalStyles(btn, originalBtnState, 
                prepResult?.originalLoadingDisplay, 
                prepResult?.currentFilter);
        }
    }
}
