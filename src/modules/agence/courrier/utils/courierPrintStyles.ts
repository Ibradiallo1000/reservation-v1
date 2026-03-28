/**
 * Styles d’impression ticket + étiquette (#print-root).
 * On évite `body * { visibility: hidden }` (aperçu vide / message Windows « pas d’aperçu » sur certains navigateurs).
 */

export const COURIER_COMBINED_PRINT_CSS = `
@media print {
  html, body {
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  body {
    visibility: hidden !important;
  }
  #print-root {
    visibility: visible !important;
    position: absolute !important;
    left: 0 !important;
    top: 0 !important;
    width: 100% !important;
    display: block !important;
    box-shadow: none !important;
    border: none !important;
    background: white !important;
  }
  #print-root * {
    visibility: visible !important;
  }
  .courier-no-print { display: none !important; }

  /* Ticket + étiquette toujours imprimés ensemble ; saut de page entre les deux. */
  #print-root .print-area-label {
    display: block !important;
  }

  .page-break {
    page-break-after: always;
    break-after: page;
  }

  /* Étiquette colis (classe .ticket sur le bloc étiquette). */
  .ticket {
    width: 300px !important;
    max-width: 300px !important;
    margin-left: auto !important;
    margin-right: auto !important;
  }
}
`;
