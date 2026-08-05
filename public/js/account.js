(async function () {
  const {
    api,
    qs,
    formatMoney,
    showAlert,
    loadVenueIntoPage,
    renderAuthNav,
    requireLoginOrRedirect,
    escapeHtml,
    isValidMobile,
    bindMobileInput
  } = TurfApp;

  await loadVenueIntoPage();
  const user = await requireLoginOrRedirect('/account');
  if (!user) return;
  await renderAuthNav();

  const alertBox = document.getElementById('alertBox');
  const tab = ['bookings', 'profile'].includes(qs('tab')) ? qs('tab') : 'bookings';

  const titles = {
    bookings: ['My Booking', 'Your bookings with live status.'],
    profile: ['Profile', 'Update your name and mobile number.'],
    password: ['Change Password', 'Update your account password.']
  };

  document.getElementById('pageTitle').textContent = titles[tab][0];
  document.getElementById('pageLead').textContent = titles[tab][1];

  document.querySelectorAll('[data-account-tab]').forEach((link) => {
    link.classList.toggle('active', link.dataset.accountTab === tab);
  });
  ['bookings', 'profile'].forEach((name) => {
    document.getElementById(`tab-${name}`).hidden = name !== tab;
  });

  if (tab === 'profile') {
    const form = document.getElementById('profileForm');
    bindMobileInput(form.mobile);
    form.name.value = user.name;
    form.mobile.value = String(user.mobile || '').replace(/\D/g, '').slice(-10);
    document.getElementById('email').value = user.email;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.innerHTML = '';
      const mobile = form.mobile.value.trim();
      if (!isValidMobile(mobile)) {
        showAlert(alertBox, 'Mobile number must be exactly 10 digits.');
        return;
      }
      try {
        const data = await api('/api/auth/me', {
          method: 'PUT',
          body: JSON.stringify({
            name: form.name.value.trim(),
            mobile
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
  }

  if (tab === 'profile') {
    document.getElementById('passwordForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      alertBox.innerHTML = '';
      const currentPassword = document.getElementById('currentPassword').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      if (newPassword !== confirmPassword) {
        showAlert(alertBox, 'New password and confirmation do not match.');
        return;
      }
      try {
        await api('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({ currentPassword, newPassword })
        });
        e.target.reset();
        showAlert(alertBox, 'Password updated successfully.', 'success');
      } catch (err) {
        showAlert(alertBox, err.message);
      }
    });
  }

  if (tab === 'bookings') {
    try {
      const data = await api('/api/auth/my-bookings');
      const body = document.getElementById('bookingsBody');
      if (!data.bookings.length) {
        body.innerHTML =
          '<tr><td colspan="6" class="text-muted p-3">No bookings yet. <a href="/book">Book a slot</a></td></tr>';
        return;
      }
      body.innerHTML = data.bookings
        .map((b) => {
          let statusClass = 'confirmed';
          let statusLabel = 'Confirmed';
          if (b.status === 'cancelled') {
            statusClass = 'cancelled';
            statusLabel = 'Cancelled';
          }
          
          if (b.checkedIn && b.status != 'cancelled') {
            statusClass = 'checked-in';
            statusLabel = 'Checked-In';
          }
          return `<tr>
            <td><a href="/confirmation?id=${encodeURIComponent(b.id)}"><code>${escapeHtml(b.id)}</code></a></td>
            <td>${escapeHtml(b.bookingDate)}</td>
            <td>${escapeHtml(b.slotLabel)}</td>
            <td>${formatMoney(b.amount)}</td>
            <td><span class="status-block ${statusClass}">${statusLabel}</span></td>
          
          </tr>`;
        })
        .join('');
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  }
})();
