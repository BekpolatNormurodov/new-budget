# Math Captcha Solver (Node.js)

Ushbu modul murakkab matematik captchalarni (jumladan, qora siyoh dog'lari - ink splashes ichidagi oq raqamlar va belgilarni) OCR orqali aniqlab, natijasini hisoblab beradi.

## Xususiyatlari
- **Sharp Image Preprocessing**: Tasvirni avtomatik masshtablash (upscale), shovqinlarni tozalash, inversiya (negate) va kontrastni oshirish (binarization).
- **Tesseract.js OCR**: Matematik belgilar (`0-9`, `+`, `-`, `*`, `/`, `=`) uchun optimallashtirilgan worker.
- **Auto Arithmetic Evaluator**: O'qilgan ifodani tekshirib, yakuniy natijani qaytaradi.
- **Turli xil formatlarni qo'llab-quvvatlash**: Fayl yo'li (`string`), `Buffer` yoki `Base64 Data URI`.

## O'rnatish va Ishga tushirish

```bash
# Paketlarni o'rnatish
npm install

# Test qilish
npm start
```

## Ishlatish namunasi (JavaScript / ES Modules)

```javascript
import { solveCaptcha } from './src/solver.js';

// 1. Fayl yo'li orqali:
const res1 = await solveCaptcha('./samples/captcha.png');
console.log(res1.answer); // Masalan: 13

// 2. Base64 orqali:
const res2 = await solveCaptcha('data:image/png;base64,iVBORw0KGgoAAA...');
console.log(res2.answer);
```
