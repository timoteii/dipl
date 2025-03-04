document.getElementById('registrationForm').addEventListener('submit', function (e) {
    e.preventDefault();

    const surname = document.getElementById('surname').value;
    const name = document.getElementById('name').value;
    const email = document.getElementById('email').value;
    const id = Date.now();  // Генерация уникального ID

    const qrData = `${surname} ${name} ${email} ${id}`;
    
    // Отправляем запрос на сервер для отправки письма с QR-кодом
    fetch('/send-email', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ surname, name, email, id, qrData })
    })
    .then(response => response.json())
    .then(data => {
        alert('QR-код отправлен на вашу почту!');
    })
    .catch(error => {
        console.error('Ошибка:', error);
        alert('Произошла ошибка, попробуйте еще раз.');
    });
});
