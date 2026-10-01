import './style.css';

const year = document.querySelector<HTMLSpanElement>('#year');

if (year) {
  year.textContent = String(new Date().getFullYear());
}
