(async function () {
  const { api, qs, formatMoney, loadVenueIntoPage, showAlert, renderAuthNav } = TurfApp;
  await loadVenueIntoPage();
  await renderAuthNav();

  const id = qs('id');
  const alertBox = document.getElementById('alertBox');
  const card = document.getElementById('confirmCard');

  if (!id) {
    showAlert(alertBox, 'Missing booking ID.');
    return;
  }

  try {
    const cached = sessionStorage.getItem(`booking:${id}`);
    let data = cached ? JSON.parse(cached) : null;
    if (!data) {
      data = await api(`/api/bookings/${encodeURIComponent(id)}`);
    }

    const b = data.booking;
    document.getElementById('bookingId').textContent = b.id;
    document.getElementById('cName').textContent = b.name;
    document.getElementById('cDate').textContent = b.bookingDate;
    document.getElementById('cSlot').textContent = b.slotLabel;
    document.getElementById('cAmount').textContent = formatMoney(b.amount);
    document.getElementById('cMobile').textContent = b.mobile;
    document.getElementById('qrImage').src = data.qrDataUrl;
    document.getElementById('pdfBtn').href = `/api/bookings/${encodeURIComponent(b.id)}/receipt.pdf`;

    if (data.notifications) {
      const parts = data.notifications.map((n) => {
        if (n.skipped) return `${n.channel}: skipped`;
        if (n.ok) return `${n.channel}: sent`;
        return `${n.channel}: failed`;
      });
      document.getElementById('notifyStatus').textContent =
        `Notifications — ${parts.join(' · ')} (enable NOTIFY_ENABLED + credentials to send)`;
    }

    card.hidden = false;
  } catch (err) {
    showAlert(alertBox, err.message);
  }
})();
