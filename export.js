// Initialize jsPDF with the global scope
const { jsPDF } = window.jspdf;

// Store original styles
let originalStyles = {};

// Function to simplify styles for PDF export
function prepareForPdfExport() {
    // Store original styles
    const elements = document.querySelectorAll('.stat, .list, body, .container');
    
    elements.forEach(el => {
        const computedStyle = window.getComputedStyle(el);
        originalStyles[el.className] = {
            background: el.style.background,
            backgroundColor: el.style.backgroundColor,
            backgroundImage: el.style.backgroundImage,
            color: el.style.color,
            border: el.style.border,
            boxShadow: el.style.boxShadow,
            filter: el.style.filter
        };
        
        // Apply simplified styles
        if (el.classList.contains('stat')) {
            el.style.background = '#f5f2e9';
            el.style.border = '1px solid #e0d9c8';
            el.style.boxShadow = 'none';
            el.style.filter = 'none';
        } else if (el.classList.contains('list')) {
            el.style.background = '#ffffff';
            el.style.border = '1px solid #e0e0e0';
        }
    });
    
    // Add a style element to override problematic styles
    const style = document.createElement('style');
    style.id = 'pdf-export-styles';
    style.textContent = `
        .stat {
            background: #f5f2e9 !important;
            border: 1px solid #e0d9c8 !important;
            box-shadow: none !important;
            filter: none !important;
        }
        .stat::after {
            display: none !important;
        }
        body {
            background: #ffffff !important;
            color: #333333 !important;
        }
        .stat-value {
            color: #B45A3A !important;
        }
    `;
    document.head.appendChild(style);
    
    return style;
}

// Function to restore original styles
function restoreOriginalStyles() {
    Object.keys(originalStyles).forEach(className => {
        const elements = document.getElementsByClassName(className);
        Array.from(elements).forEach(el => {
            const original = originalStyles[className];
            if (original) {
                Object.entries(original).forEach(([prop, value]) => {
                    el.style[prop] = value;
                });
            }
        });
    });
    
    const style = document.getElementById('pdf-export-styles');
    if (style) {
        style.remove();
    }
    
    originalStyles = {};
}

document.addEventListener('DOMContentLoaded', () => {
    const exportBtn = document.getElementById('exportPdf');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportToPdf);
    }
});

async function exportToPdf() {
    const btn = document.getElementById('exportPdf');
    const originalText = btn.textContent;
    let styleElement = null;
    
    try {
        // Show loading state
        btn.disabled = true;
        btn.textContent = 'Generating PDF...';
        
        // Apply simplified styles
        styleElement = prepareForPdfExport();
        
        // Give the browser a moment to apply styles
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Get the dashboard container
        const element = document.querySelector('.container');
        
        // Use html2canvas to capture the dashboard
        const canvas = await html2canvas(element, {
            scale: 2,
            useCORS: true,
            allowTaint: true,
            logging: false,
            backgroundColor: '#ffffff',
            // Disable features that might cause issues
            ignoreElements: (element) => {
                return element.id === 'exportPdf';
            },
            onclone: (clonedDoc) => {
                // Ensure our simplified styles are applied in the cloned document
                const style = clonedDoc.createElement('style');
                style.textContent = `
                    .stat {
                        background: #f5f2e9 !important;
                        border: 1px solid #e0d9c8 !important;
                        box-shadow: none !important;
                        filter: none !important;
                    }
                    .stat::after { display: none !important; }
                    body { background: #ffffff !important; color: #333333 !important; }
                    .stat-value { color: #B45A3A !important; }
                `;
                clonedDoc.head.appendChild(style);
            }
        });
        
        // Create PDF
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a4'
        });
        
        // Calculate dimensions to maintain aspect ratio
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();
        const imgAspectRatio = canvas.width / canvas.height;
        
        let imgWidth = pageWidth - 20; // 10mm margins
        let imgHeight = imgWidth / imgAspectRatio;
        
        // If the image is too tall, scale it down
        if (imgHeight > pageHeight - 30) {
            imgHeight = pageHeight - 30;
            imgWidth = imgHeight * imgAspectRatio;
        }
        
        // Center the image on the page
        const x = (pageWidth - imgWidth) / 2;
        const y = 15; // 15mm top margin
        
        // Add image to PDF
        pdf.addImage(imgData, 'PNG', x, y, imgWidth, imgHeight);
        
        // Add footer with timestamp
        const date = new Date().toLocaleString();
        pdf.setFontSize(10);
        pdf.setTextColor(100);
        pdf.text(`Generated on ${date}`, 10, pageHeight - 10);
        
        // Save the PDF
        pdf.save(`AAA_Dashboard_${new Date().toISOString().split('T')[0]}.pdf`);
        
    } catch (error) {
        console.error('Error generating PDF:', error);
        alert('Failed to generate PDF. Please try again.');
    } finally {
        // Restore original styles
        restoreOriginalStyles();
        
        // Clean up any remaining style elements
        const style = document.getElementById('pdf-export-styles');
        if (style) style.remove();
        
        // Reset button state
        if (btn) {
            btn.disabled = false;
            btn.textContent = originalText;
        }
    }
}
