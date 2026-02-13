import React from 'react';

const TicketPrintStyles: React.FC = () => {
  return (
    <style>{`
      @media print {
        body * {
          visibility: hidden !important;
        }

        #ticket-print,
        #ticket-print * {
          visibility: visible !important;
        }

        #ticket-print {
          position: absolute;
          left: 0;
          top: 0;
          width: 100%;
          background: white;
        }

        .no-print {
          display: none !important;
        }
      }

      @page {
        size: 80mm auto;
        margin: 4mm;
      }

      .cut-line {
        border-top: 1px dashed #9ca3af;
        margin: 8px 0;
        position: relative;
      }

      .cut-line::after {
        content: "✂";
        position: absolute;
        right: -4px;
        top: -10px;
        font-size: 10px;
        color: #9ca3af;
      }
    `}</style>
  );
};

export default TicketPrintStyles;
