(function (global) {
  const PAYMENT_MODES = [
    { value: 'cash', label: 'Cash' },
    { value: 'upi', label: 'UPI' },
    { value: 'card', label: 'Card' },
    { value: 'other', label: 'Other' }
  ];

  function initCheckinModal({ api, showAlert, formatMoney, alertBox, onSuccess }) {
    const modal = document.getElementById('checkinModal');
    if (!modal) return null;

    const bookedAmountEl = document.getElementById('checkinBookedAmount');
    const discountInput = document.getElementById('checkinDiscount');
    const receivedInput = document.getElementById('checkinAmountReceived');
    const modeSelect = document.getElementById('checkinPaymentMode');
    const bookingIdEl = document.getElementById('checkinModalBookingId');
    const confirmBtn = document.getElementById('checkinConfirmBtn');

    let pendingBooking = null;
    let receivedEdited = false;

    function closeCheckinModal() {
      modal.hidden = true;
      pendingBooking = null;
      receivedEdited = false;
      discountInput.value = '0';
      receivedInput.value = '';
      modeSelect.value = '';
    }

    function syncReceivedFromDiscount() {
      if (!pendingBooking || receivedEdited) return;
      const discount = Math.max(0, Number(discountInput.value) || 0);
      const booked = Number(pendingBooking.amount) || 0;
      receivedInput.value = String(Math.max(0, booked - discount));
    }

    discountInput.addEventListener('input', () => syncReceivedFromDiscount());
    receivedInput.addEventListener('input', () => {
      receivedEdited = true;
    });

    modal.querySelectorAll('[data-checkin-dismiss]').forEach((el) => {
      el.addEventListener('click', () => closeCheckinModal());
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !modal.hidden) closeCheckinModal();
    });

    function openCheckinModal(booking) {
      if (!booking || booking.status === 'cancelled' || booking.checkedIn) return;
      pendingBooking = booking;
      receivedEdited = false;
      bookingIdEl.textContent = booking.id;
      bookedAmountEl.textContent = formatMoney(booking.amount);
      discountInput.value = '0';
      receivedInput.value = String(booking.amount);
      modeSelect.value = 'cash';
      modal.hidden = false;
      modeSelect.focus();
    }

    confirmBtn.addEventListener('click', async () => {
      if (!pendingBooking) return;
      const discount = Number(discountInput.value) || 0;
      const amountReceived = Number(receivedInput.value);
      const paymentMode = modeSelect.value;
      if (!paymentMode) {
        showAlert(alertBox, 'Select a payment mode.');
        return;
      }
      if (!Number.isFinite(amountReceived) || amountReceived < 0) {
        showAlert(alertBox, 'Enter a valid amount received.');
        return;
      }
      confirmBtn.disabled = true;
      try {
        const result = await api(`/api/admin/bookings/${pendingBooking.id}/check-in`, {
          method: 'POST',
          body: JSON.stringify({
            checkedIn: true,
            discount,
            amountReceived,
            paymentMode
          })
        });
        closeCheckinModal();
        const parts = (result.notifications || []).map((n) => {
          if (n.skipped) return `${n.channel}: skipped`;
          if (n.ok) return `${n.channel}: sent`;
          return `${n.channel}: failed`;
        });
        showAlert(
          alertBox,
          `Checked in. Received ${formatMoney(amountReceived)} via ${paymentMode}. Notifications — ${parts.join(' · ') || 'none'}`,
          'success'
        );
        if (onSuccess) await onSuccess(result.booking);
      } catch (err) {
        showAlert(alertBox, err.message);
      } finally {
        confirmBtn.disabled = false;
      }
    });

    return { openCheckinModal, closeCheckinModal };
  }

  global.TurfCheckinModal = { init: initCheckinModal, PAYMENT_MODES };
})(window);
