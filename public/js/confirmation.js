(async function () {
  const { api, qs, formatMoney, loadVenueIntoPage, showAlert, requireLoginOrRedirect, renderAuthNav } = TurfApp;
  await loadVenueIntoPage();

  const id = qs('id');
  const alertBox = document.getElementById('alertBox');
  const card = document.getElementById('confirmCard');

  if (!id) {
    await renderAuthNav();
    showAlert(alertBox, 'Missing booking ID.');
    return;
  }

  const next = `/confirmation?id=${encodeURIComponent(id)}`;
  const user = await requireLoginOrRedirect(next);
  if (!user) return;
  await renderAuthNav();

  try {
    // Always load fresh booking so cancel/check-in status is current.
    const data = await api(`/api/bookings/${encodeURIComponent(id)}`);
    sessionStorage.setItem(`booking:${id}`, JSON.stringify(data));

    const b = data.booking;
    let statusClass = 'confirmed';
    let statusLabel = 'Confirmed';
    if (b.status === 'cancelled') {
      statusClass = 'cancelled';
      statusLabel = 'Cancelled';
    } else if (b.checkedIn) {
      statusClass = 'checked-in';
      statusLabel = 'Checked-In';
    }

    const statusEl = document.getElementById('bookingStatus');
    statusEl.className = `status-block status-block-lg ${statusClass}`;
    statusEl.textContent = statusLabel;

    document.getElementById('bookingId').textContent = b.id;
    document.getElementById('cName').textContent = b.name;
    document.getElementById('cDate').textContent = b.bookingDate;
    document.getElementById('cSlot').textContent = b.slotLabel;
    document.getElementById('cAmount').textContent = formatMoney(b.amount);
    document.getElementById('cMobile').textContent = b.mobile;
    document.getElementById('qrImage').src = data.qrDataUrl;
    document.getElementById('pdfBtn').href = `/api/bookings/${encodeURIComponent(b.id)}/receipt.pdf`;

    const reasonRow = document.getElementById('cancelReasonRow');
    const reasonEl = document.getElementById('cCancelReason');
    if (b.status === 'cancelled' && b.cancelReason) {
      reasonEl.textContent = b.cancelReason;
      reasonRow.hidden = false;
    } else {
      reasonEl.textContent = '';
      reasonRow.hidden = true;
    }

    const qrWrap = document.getElementById('qrWrap');
    const pdfBtn = document.getElementById('pdfBtn');
    if (b.status === 'cancelled') {
      qrWrap.hidden = true;
      pdfBtn.hidden = true;
      document.getElementById('confirmHint').textContent = b.cancelReason
        ? `This booking was cancelled. Reason: ${b.cancelReason}`
        : 'This booking was cancelled.';
    } else if (b.checkedIn) {
      document.getElementById('confirmHint').textContent = 'Checked in at the venue.';
    } else {
      document.getElementById('confirmHint').textContent = 'Show this QR code at the venue for check-in.';
    }

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
