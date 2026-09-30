document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(button => button.classList.remove('active'));
    item.classList.add('active');
  });
});

document.querySelectorAll('.supply-card input').forEach(input => {
  input.addEventListener('change', () => {
    const label = input.closest('label');
    label.style.textDecoration = input.checked ? 'line-through' : 'none';
    label.style.opacity = input.checked ? '.48' : '1';
  });
});
