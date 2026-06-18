# Thiệp cưới online

Website tĩnh gồm:

- `Wedding_invitation_Th.html`: thiệp dùng map phiên bản Th.
- `Wedding_invitation_Tr.html`: thiệp dùng map phiên bản Tr.
- `styles.css`: giao diện, màu sắc, responsive.
- `script-th.js`: thông tin thiệp phiên bản Th.
- `script-tr.js`: thông tin thiệp phiên bản Tr.
- `assets/silk-floral-bg.png`: ảnh nền hoa lụa nâu được tạo riêng cho thiệp này.
- `assets/couple-photo.png`: ảnh cưới minh họa cho phần album.

## Cách chỉnh thông tin

Mở `script-th.js` hoặc `script-tr.js` và sửa khối `wedding` ở đầu file:

```js
const wedding = {
  groom: "Minh Anh",
  bride: "Gia Hân",
  dateISO: "2026-12-20T11:00:00+07:00",
  displayDate: "Thứ bảy, 20 tháng 12 năm 2026",
  shortDate: "20.12.2026",
  time: "11:00 AM",
  venue: "The Silk Garden",
  address: "123 Đường Hạnh Phúc, Quận 1, TP. Hồ Chí Minh",
  mapUrl: "https://maps.google.com/?q=The%20Silk%20Garden%20Ho%20Chi%20Minh",
  mapEmbedUrl: "https://maps.google.com/maps?q=The%20Silk%20Garden%20Ho%20Chi%20Minh&output=embed",
  phone: "tel:+84901234567",
  rsvpUrl: "https://docs.google.com/forms/",
  qrImage: "",
};
```

## Cách thay ảnh cưới

Copy ảnh thật của bạn vào thư mục `assets`, ví dụ:

- `assets/photo-1.jpg`
- `assets/photo-2.jpg`
- `assets/photo-3.jpg`

Sau đó sửa mảng `photos` trong file JS tương ứng:

```js
photos: [
  {
    src: "assets/photo-1.jpg",
    alt: "Ảnh cưới của Minh Anh và Gia Hân",
    title: "Khoảnh khắc của chúng mình",
  },
],
```

## Cách thay map

Sửa `address`, `mapUrl`, và `mapEmbedUrl` trong file JS tương ứng.

Với Google Maps, bạn có thể dùng dạng:

```text
https://maps.google.com/maps?q=TÊN%20ĐỊA%20ĐIỂM&output=embed
```

## Cách thay QR code

Mặc định QR code được tạo từ `rsvpUrl`. Nếu bạn có ảnh QR thật, copy vào `assets`, ví dụ `assets/qr-code.png`, rồi sửa:

```js
qrImage: "assets/qr-code.png",
```

## Cách xem

Mở trực tiếp file `Wedding_invitation_Th.html` hoặc `Wedding_invitation_Tr.html` bằng trình duyệt.

## Cách gửi cho bạn bè

Bạn có thể upload toàn bộ thư mục này lên Netlify, Vercel, GitHub Pages hoặc hosting bất kỳ. Chỉ cần giữ nguyên các file cùng cấu trúc thư mục.

# Example
https://chungdoi.com/mau-thiep/hoa-lua-nau/demo
