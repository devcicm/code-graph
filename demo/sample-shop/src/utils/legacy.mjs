// Código viejo que nadie importa (archivo huérfano).
const fs = require('fs');
export const oldFormat = (n) => fs.existsSync('.') ? `${n} USD` : String(n);
