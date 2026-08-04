const QRCode = require('qrcode');
const PDFDocument = require('pdfkit');
const { getVenue, slotLabel } = require('./venue');

async function generateQrDataUrl(bookingId, appUrl) {
  const payload = JSON.stringify({
    bookingId,
    verifyUrl: `${appUrl.replace(/\/$/, '')}/api/bookings/${bookingId}`
  });
  return QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 280
  });
}

async function buildReceiptPdf(booking) {
  const venue = await getVenue();
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const qrDataUrl = await generateQrDataUrl(booking.id, appUrl);
  const qrBase64 = qrDataUrl.split(',')[1];
  const qrBuffer = Buffer.from(qrBase64, 'base64');
  const slot = booking.slotLabel || slotLabel(booking.slotStart, booking.slotEnd);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#1b5e20').fontSize(22).text(venue.name, { align: 'left' });
    doc.moveDown(0.3);
    doc.fillColor('#333').fontSize(12).text('Booking Receipt', { align: 'left' });
    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#c8e6c9');
    doc.moveDown();

    const rows = [
      ['Booking ID', booking.id],
      ['Name', booking.name],
      ['Mobile', booking.mobile],
      ['Email', booking.email],
      ['Date', booking.bookingDate],
      ['Slot', slot],
      ['Amount', `INR ${booking.amount}`],
      ['Status', booking.status],
      ['Notes', booking.notes || '—']
    ];

    rows.forEach(([label, value]) => {
      doc.fontSize(11).fillColor('#666').text(label, { continued: false });
      doc.fontSize(13).fillColor('#111').text(String(value));
      doc.moveDown(0.4);
    });

    doc.moveDown();
    doc.image(qrBuffer, 50, doc.y, { width: 140 });
    doc.fontSize(10).fillColor('#555').text('Scan at check-in', 200, doc.y - 60);

    doc.moveDown(8);
    doc.fontSize(10).fillColor('#777').text(venue.address);
    doc.text(`Phone: ${venue.phone}`);
    doc.text(`Generated: ${new Date().toLocaleString()}`);

    doc.end();
  });
}

module.exports = { generateQrDataUrl, buildReceiptPdf };
