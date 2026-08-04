(async function () {
  const { api, qs, showAlert, loadVenueIntoPage, renderAuthNav } = TurfApp;
  await loadVenueIntoPage();
  await renderAuthNav();

  const alertBox = document.getElementById('alertBox');
  const token = qs('token');
  const forgotForm = document.getElementById('forgotForm');
  const resetForm = document.getElementById('resetForm');

  if (token) {
    resetForm.hidden = false;
  } else {
    forgotForm.hidden = false;
  }

  forgotForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    try {
      const result = await api('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email: document.getElementById('forgotEmail').value.trim() })
      });
      showAlert(alertBox, result.message || 'If that email exists, a reset link was sent.', 'success');
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    alertBox.innerHTML = '';
    const password = document.getElementById('newPassword').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    if (password !== confirmPassword) {
      showAlert(alertBox, 'Passwords do not match.');
      return;
    }
    try {
      await api('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password })
      });
      showAlert(alertBox, 'Password saved. Redirecting…', 'success');
      window.location.href = '/account?tab=bookings';
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });
})();
