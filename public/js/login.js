(async function () {
  const { api, qs, showAlert, loadVenueIntoPage, renderAuthNav, getCurrentUser, isValidMobile, bindMobileInput } = TurfApp;
  await loadVenueIntoPage();
  const user = await getCurrentUser();
  await renderAuthNav();

  if (user) {
    const next = qs('next') || '/book';
    window.location.replace(next.startsWith('/') ? next : '/book');
    return;
  }

  bindMobileInput(document.getElementById('regMobile'));

  document.querySelectorAll('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-mode]').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.getElementById('loginForm').hidden = mode !== 'login';
      document.getElementById('registerForm').hidden = mode !== 'register';
    });
  });

  document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('alertBox');
    alertBox.innerHTML = '';
    try {
      await api('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({
          email: document.getElementById('loginEmail').value.trim(),
          password: document.getElementById('loginPassword').value
        })
      });
      const next = qs('next') || '/book';
      window.location.href = next.startsWith('/') ? next : '/book';
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });

  document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const alertBox = document.getElementById('alertBox');
    alertBox.innerHTML = '';
    const mobile = document.getElementById('regMobile').value.trim();
    if (!isValidMobile(mobile)) {
      showAlert(alertBox, 'Mobile number must be exactly 10 digits.');
      return;
    }
    const password = document.getElementById('regPassword').value;
    const confirmPassword = document.getElementById('regPasswordConfirm').value;
    if (password !== confirmPassword) {
      showAlert(alertBox, 'Passwords do not match.');
      return;
    }
    try {
      await api('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('regName').value.trim(),
          mobile,
          email: document.getElementById('regEmail').value.trim(),
          password
        })
      });
      const next = qs('next') || '/book';
      window.location.href = next.startsWith('/') ? next : '/book';
    } catch (err) {
      showAlert(alertBox, err.message);
    }
  });
})();
