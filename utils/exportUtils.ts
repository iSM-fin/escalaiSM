
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import html2canvas from "html2canvas";

export interface FinancialExportRow {
  date: string;
  hospitalName: string;
  in1: string;
  out1: string;
  in2: string;
  out2: string;
  durationLabel: string;
  value: number;
  doctorName: string;
  obs: string;
}

/**
 * Exporta os dados financeiros para CSV
 */
export const exportToCSV = (data: FinancialExportRow[], filename: string) => {
  const headers = [
    "Data",
    "Hospital",
    "Entrada 1",
    "Saída 1",
    "Entrada 2",
    "Saída 2",
    "Duração",
    "Valor (R$)",
    "Médico",
    "Observações",
  ];

  const rows = data.map((row) => [
    row.date,
    row.hospitalName,
    row.in1,
    row.out1,
    row.in2,
    row.out2,
    row.durationLabel,
    row.value.toFixed(2).replace(".", ","),
    row.doctorName,
    `"${row.obs.replace(/"/g, '""')}"`, // Escape quotes for CSV
  ]);

  const csvContent =
    "data:text/csv;charset=utf-8,\uFEFF" + // UTF-8 BOM
    [headers.join(";"), ...rows.map((e) => e.join(";"))].join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

/**
 * Exporta os dados financeiros para PDF usando jsPDF e autoTable
 */
export const exportToPDF = (data: FinancialExportRow[], filename: string, totalSum: number) => {
  const doc: any = new jsPDF();

  doc.text("Relatório Financeiro - Escala de Anestesiologia", 14, 15);
  doc.setFontSize(10);
  doc.text(`Gerado em: ${new Date().toLocaleDateString('pt-BR')}`, 14, 22);

  const tableColumn = [
    "Data",
    "Hospital",
    "Ent 1",
    "Sai 1",
    "Ent 2",
    "Sai 2",
    "Plantão",
    "Valor",
    "Médico",
    "Obs",
  ];

  const tableRows = data.map((row) => [
    row.date,
    row.hospitalName,
    row.in1,
    row.out1,
    row.in2,
    row.out2,
    row.durationLabel,
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.value),
    row.doctorName,
    row.obs,
  ]);

  autoTable(doc, {
    head: [tableColumn],
    body: tableRows,
    startY: 30,
    styles: { fontSize: 7, cellPadding: 1.5 },
    headStyles: { fillColor: [16, 185, 129] }, // Emerald color
    columnStyles: {
      0: { cellWidth: 15 }, // Data
      1: { cellWidth: 20 }, // Hospital
      2: { cellWidth: 10 }, // E1
      3: { cellWidth: 10 }, // S1
      4: { cellWidth: 10 }, // E2
      5: { cellWidth: 10 }, // S2
      6: { cellWidth: 15 }, // Plantão
      7: { cellWidth: 20, halign: 'right' }, // Valor
      8: { cellWidth: 25 }, // Médico
      9: { cellWidth: 'auto' }, // Obs
    },
  });

  // Add Total at the bottom
  const finalY = doc.lastAutoTable ? doc.lastAutoTable.finalY + 10 : 40;
  doc.setFontSize(12);
  doc.text(
    `Total Geral: ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(totalSum)}`,
    14,
    finalY
  );

  doc.save(filename);
};

/**
 * Captura um elemento HTML e salva como imagem PNG
 */
export const exportAsImage = async (elementId: string, filename: string) => {
  const element = document.getElementById(elementId);
  if (!element) {
    console.error(`Element with id ${elementId} not found`);
    return;
  }

  try {
    const canvas = await html2canvas(element, {
      scale: 2, // Higher resolution
      backgroundColor: null, // Transparent background if supported, or white
      useCORS: true, // Handle images if any
      logging: false,
    });

    const link = document.createElement("a");
    link.download = filename;
    link.href = canvas.toDataURL("image/png");
    link.click();
  } catch (error) {
    console.error("Error generating image:", error);
    alert("Erro ao gerar imagem da escala.");
  }
};
