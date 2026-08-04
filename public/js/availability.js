(async function () {
  const { api, todayISO, qs, formatMoney, loadVenueIntoPage, showAlert, renderAuthNav, getCurrentUser, loginUrl } = TurfApp;
  await loadVenueIntoPage();
  await renderAuthNav();
  const user = await getCurrentUser();

  const dateInput = document.getElementById('dateInput');
  const slotGrid = document.getElementById('slotGrid');
  const priceInfo = document.getElementById('priceInfo');
  const alertBox = document.getElementById('alertBox');
  const refreshBtn = document.getElementById('refreshBtn');

  dateInput.min = todayISO();
  dateInput.value = qs('date') || todayISO();

  async function load() {
    alertBox.innerHTML = '';
    slotGrid.innerHTML = '<div class="text-muted">Loading slots…</div>';
    try {
      const data = await api(`/api/bookings/availability?date=${encodeURIComponent(dateInput.value)}`);
      priceInfo.textContent = `${data.pricing.label} · ${formatMoney(data.pricing.amount)} / hour`;
      slotGrid.innerHTML = '';
      data.slots.forEach((slot) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `slot-chip ${slot.available ? 'available' : 'booked'}`;
        btn.disabled = !slot.available;
        btn.innerHTML = `<strong>${slot.label}</strong><span class="price">${slot.available ? formatMoney(slot.price) : 'Booked'}</span>`;
        if (slot.available) {
          btn.addEventListener('click', () => {
            const params = new URLSearchParams({
              date: dateInput.value,
              slot: String(slot.start)
            });
            const bookPath = `/book?${params.toString()}`;
            window.location.href = user ? bookPath : loginUrl(bookPath);
          });
        }
        slotGrid.appendChild(btn);
      });
    } catch (err) {
      slotGrid.innerHTML = '';
      showAlert(alertBox, err.message);
    }
  }

  dateInput.addEventListener('change', load);
  refreshBtn.addEventListener('click', load);
  load();
})();
