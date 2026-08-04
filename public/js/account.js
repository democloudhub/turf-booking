(async function () {
  const { api, formatMoney, showAlert, loadVenueIntoPage, renderAuthNav, requireLoginOrRedirect, escapeHtml } = TurfApp;
  await loadVenueIntoPage();
  const user = await requireLoginOrRedirect('/account');
  if (!user) return;
  await renderAuthNav();

  const alertBox = document.getElementById('alertBox');
  const form = document.getElementById('profileForm');
  form.name.value = user.name;
  form.mobile.value = user.mobile;
  document.getElementById('email').value = user.email;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    try {
      const data = await api('/api/auth/me', {
        method: 'PUT',
        body: JSON.stringify({
          name: form.name.value.trim(),
          mobile: form.mobile.value.trim()
        })
      });
      form.name.value = data.user.name;
      form.mobile.value = data.user.mobile;
      showAlert(alertBox, 'Profile updated.', 'success');
      await renderAuthNav();
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  try {
    const data = await api('/api/auth/my-bookings');
    const body = document.getElementById('bookingsBody');
    if (!data.bookings.length) {
      body.innerHTML = '<tr><td colspan="6" class="text-muted p-3">No bookings yet. <a href="/book">Book a slot</a></td></tr>';
      return;
    }
    body.innerHTML = data.bookings
      .map((b) => {
        const status = b.checkedIn
          ? 'Checked-in'
          : b.status === 'cancelled'
            ? 'Cancelled'
            : 'Confirmed';
        return `<tr>
          <td><code>${escapeHtml(b.id)}</code></td>
          <td>${escapeHtml(b.bookingDate)}</td>
          <td>${escapeHtml(b.slotLabel)}</td>
          <td>${formatMoney(b.amount)}</td>
          <td>${escapeHtml(status)}</td>
          <td><a href="/confirmation?id=${encodeURIComponent(b.id)}">View</a></td>
        </tr>`;
      })
      .join('');
  } catch (err) {
    showAlert(alertBox, err.message);
  }
})();
