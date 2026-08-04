(async function () {
  const {
    api,
    todayISO,
    qs,
    formatMoney,
    loadVenueIntoPage,
    showAlert,
    requireLoginOrRedirect,
    renderAuthNav,
    isValidMobile,
    bindMobileInput,
    normalizeMobileInput
  } = TurfApp;

  await loadVenueIntoPage();
  const user = await requireLoginOrRedirect(`/book${window.location.search}`);
  if (!user) return;
  await renderAuthNav();

  const form = document.getElementById('bookingForm');
  const dateInput = document.getElementById('bookingDate');
  const slotGrid = document.getElementById('slotGrid');
  const slotStartInput = document.getElementById('slotStart');
  const totalAmount = document.getElementById('totalAmount');
  const priceLabel = document.getElementById('priceLabel');
  const alertBox = document.getElementById('alertBox');
  const submitBtn = document.getElementById('submitBtn');

  bindMobileInput(form.mobile);
  form.name.value = user.name;
  form.mobile.value = normalizeMobileInput(user.mobile);
  form.email.value = user.email;
  form.email.readOnly = true;

  let preselectSlot = qs('slot');

  dateInput.min = todayISO();
  dateInput.value = qs('date') || todayISO();

  async function loadSlots() {
    slotGrid.innerHTML = '<div class="text-muted">Loading…</div>';
    slotStartInput.value = '';
    totalAmount.textContent = '—';
    priceLabel.textContent = '';
    try {
      const data = await api(`/api/bookings/availability?date=${encodeURIComponent(dateInput.value)}`);
      slotGrid.innerHTML = '';
      data.slots.forEach((slot) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `slot-chip ${slot.available ? 'available' : 'booked'}`;
        btn.disabled = !slot.available;
        btn.dataset.start = String(slot.start);
        btn.innerHTML = `<strong>${slot.label}</strong><span class="price">${slot.available ? formatMoney(slot.price) : 'Booked'}</span>`;
        if (slot.available) {
          btn.addEventListener('click', () => selectSlot(btn, slot));
        }
        slotGrid.appendChild(btn);
      });

      if (preselectSlot) {
        const match = slotGrid.querySelector(`[data-start="${preselectSlot}"]`);
        if (match && !match.disabled) {
          match.click();
        }
        preselectSlot = null;
      }
    } catch (err) {
      slotGrid.innerHTML = '';
      showAlert(alertBox, err.message);
    }
  }

  function selectSlot(btn, slot) {
    slotGrid.querySelectorAll('.slot-chip').forEach((el) => el.classList.remove('selected'));
    btn.classList.add('selected');
    slotStartInput.value = String(slot.start);
    totalAmount.textContent = formatMoney(slot.price);
    priceLabel.textContent = `${slot.priceLabel} rate · ${slot.label}`;
  }

  dateInput.addEventListener('change', loadSlots);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    if (!slotStartInput.value) {
      showAlert(alertBox, 'Please select an available slot.');
      return;
    }
    const mobile = form.mobile.value.trim();
    if (!isValidMobile(mobile)) {
      showAlert(alertBox, 'Mobile number must be exactly 10 digits.');
      return;
    }
    submitBtn.disabled = true;
    submitBtn.textContent = 'Booking…';
    try {
      const payload = {
        name: form.name.value.trim(),
        mobile,
        bookingDate: form.bookingDate.value,
        slotStart: Number(form.slotStart.value),
        notes: form.notes.value.trim()
      };
      const result = await api('/api/bookings', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      sessionStorage.setItem(
        `booking:${result.booking.id}`,
        JSON.stringify({
          booking: result.booking,
          qrDataUrl: result.qrDataUrl,
          notifications: result.notifications
        })
      );
      window.location.href = `/confirmation?id=${encodeURIComponent(result.booking.id)}`;
    } catch (err) {
      if (err.code === 'LOGIN_REQUIRED' || err.status === 401) {
        window.location.href = TurfApp.loginUrl();
        return;
      }
      showAlert(alertBox, err.message);
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Booking';
      loadSlots();
    }
  });

  loadSlots();
})();
