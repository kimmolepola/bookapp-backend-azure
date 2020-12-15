const express = require('express');
const path = require('path');

const app = express();

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'asdf.html'));
  console.log('erqwqwerweqr------');
});

app.listen(process.env.PORT || 1337, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
