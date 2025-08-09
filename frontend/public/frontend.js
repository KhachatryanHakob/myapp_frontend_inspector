// frontend.js
document.addEventListener('DOMContentLoaded', () => {
  const uploadForm = document.getElementById('upload-form');
  const fileInput = document.getElementById('file-input');
  const fileNameSpan = document.getElementById('file-name');
  const fileSizeSpan = document.getElementById('file-size');
  const uploadStatusSpan = document.getElementById('upload-status');

  // Функция для форматирования размера файла в читаемый вид
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 байт';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['байт', 'KB', 'MB', 'GB', 'TB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  // Обработчик события выбора файла
  fileInput.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (file) {
      // Отображение имени и размера файла сразу после выбора
      fileNameSpan.textContent = file.name;
      fileSizeSpan.textContent = formatBytes(file.size);
      uploadStatusSpan.textContent = 'Файл готов к загрузке.';
    } else {
      fileNameSpan.textContent = 'Нет информации';
      fileSizeSpan.textContent = 'Нет информации';
      uploadStatusSpan.textContent = 'Ожидание выбора файла...';
    }
  });

  // Обработчик отправки формы
  uploadForm.addEventListener('submit', async (event) => {
    event.preventDefault(); // Предотвращаем стандартное поведение формы (перезагрузку страницы)

    const file = fileInput.files[0];
    if (!file) {
      alert('Пожалуйста, выберите файл для загрузки.');
      return;
    }

    uploadStatusSpan.textContent = 'Загрузка...';

    const formData = new FormData(uploadForm);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (response.ok) {
        uploadStatusSpan.textContent = `✅ Загрузка завершена! Местоположение: ${result.location}`;
        // Здесь можно очистить форму, если нужно
        // uploadForm.reset();
      } else {
        uploadStatusSpan.textContent = `❌ Ошибка загрузки: ${result.error}`;
        console.error('Ошибка при загрузке файла:', result.error);
      }
    } catch (error) {
      uploadStatusSpan.textContent = '❌ Сетевая ошибка.';
      console.error('Сетевая ошибка:', error);
    }
  });
});
