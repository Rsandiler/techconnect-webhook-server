async function fetchFiles() {
    try {
        const response = await fetch(`/list-files`); // Replace with your server's URL
        const data = await response.json();
        console.log(data);

        if (response.ok) {
            const fileList = data.files;

            const fileListElement = document.getElementById('file-list');
            fileListElement.innerHTML = '';

            fileList.forEach(fileName => {
                const listItem = document.createElement('li');
                listItem.textContent = fileName;
                fileListElement.appendChild(listItem);
            });
        } else {
            console.error('Error:', data.error);
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

fetchFiles();
