import "@fontsource/rubik/400.css";
import "@fontsource/rubik/500.css";
import "@fontsource/rubik/700.css";
import "@fontsource/rubik/900.css";
import "./hata.css";
import qrcode from "qrcode-generator";

/**
 * «Клін Клінич» is made for the iPhone only. On a computer (no touch screen)
 * nothing heavy is loaded: a page asks you to open the game on your phone and
 * shows a QR code of the address. `?still` / `?dev` skip this for the
 * offline checks.
 */

const params = new URLSearchParams(location.search);
const phone = matchMedia("(pointer: coarse)").matches && navigator.maxTouchPoints > 0;

if (phone || params.has("still") || params.has("dev")) {
  void import("./game");
} else {
  const url = `${location.origin}${location.pathname}`;
  const qr = qrcode(0, "M");
  qr.addData(url);
  qr.make();
  document.body.innerHTML = `
    <main class="desk">
      <div class="desk-text">
        <div class="eyebrow">ГРА ДЛЯ IPHONE</div>
        <h1>Клін<br>Клінич</h1>
        <p>Рогалик від першої особи: відмий, покоси й залатай чужу хату — і купи техніку потужнішу.</p>
        <p>Гра зроблена тільки для iPhone. Наведи камеру телефона на код або відкрий адресу в Safari і тримай телефон горизонтально.</p>
        <a href="${url}">${url.replace(/^https?:\/\//, "")}</a>
      </div>
      <div class="desk-qr">${qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true })}</div>
    </main>`;
}
