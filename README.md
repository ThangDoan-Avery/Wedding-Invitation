# Wedding Invitation

Thiệp cưới trực tuyến của Hữu Thắng và Thu Trang, triển khai dưới dạng website tĩnh trên Netlify.

## Đường dẫn

Trang chính mở thẳng một thiệp duy nhất, không có màn hình chọn thiệp. Khi URL không chứa tên khách hợp lệ, thiệp hiển thị `Quý khách`:

```text
https://tntweddinginvitation.netlify.app/
```

Đường dẫn chia sẻ được khuyến nghị cho thiệp cá nhân hóa:

```text
https://tntweddinginvitation.netlify.app/guest=b%E1%BA%A1n+Th%E1%BA%AFng+A3
```

URL trên hiển thị tên `Bạn Thắng A3`. Định dạng query cũ vẫn được hỗ trợ:

```text
https://tntweddinginvitation.netlify.app/?guest=B%E1%BA%A1n+Th%E1%BA%AFng+A3
```

- Cả dấu `+` thô và `%20` đều trở thành khoảng trắng.
- Khoảng trắng ở đầu/cuối được loại bỏ. Chỉ chữ cái đầu tiên của toàn bộ tên sau khi trim được viết hoa; phần còn lại được giữ nguyên, bao gồm chữ hoa có sẵn và chuỗi như `A3`.
- Nếu URL đồng thời có `/guest=...` và `?guest=...`, tên trong path được ưu tiên.
- Khi không có tên, tên rỗng hoặc mã URL không giải mã hợp lệ, thiệp hiển thị `Quý khách`.
- Tên khách được đưa vào giao diện bằng `textContent`, không được thực thi như HTML.
- Tên nằm trong URL có thể xuất hiện trong lịch sử trình duyệt; không dùng tham số này cho thông tin riêng tư.

## Cấu trúc

```text
deploy/
  index.html
  app.js
  styles.css
  assets/
netlify.toml
supabase-wishes.sql
```

Website không dùng framework, package manager hoặc bước build. Netlify phục vụ trực tiếp thư mục `deploy`.

Trang `/` mở trực tiếp thiệp đơn và không còn card chọn phiên bản. Hai đường dẫn thiệp cũ dành riêng cho phía Thắng và Trang được redirect vĩnh viễn về `/`. Thiệp mới hiển thị cả hai địa điểm. Form RSVP chung chỉ hỏi tên, khả năng tham dự và số lượng người, không hỏi phía mời.

Layout hiện đi theo nhịp thiệp dọc 500px: thiệp hoa cá nhân hóa mở đầu, hero ảnh toàn trang, thông tin gia đình, báo hỷ, hai card tiệc cưới, hành trình xe cưới và timeline ngày cưới (09:00 Đón khách, 10:00 Khai tiệc, 11:00 Lễ thành hôn), lịch Save our date, ảnh Invitation với countdown, hai ảnh Love/You, ảnh dọc kèm RSVP, quà cưới, album carousel, lời chúc và ảnh cảm ơn. Nút Bật/Tắt nhạc nằm ở góc dưới bên phải.

Countdown có bốn ô ngày/giờ/phút/giây, cập nhật mỗi giây tới `2026-11-15T09:00:00+07:00`. Khi đến ngày cưới, bộ đếm dừng ở 0. Ảnh đang dùng tài nguyên có sẵn; thay từng đường dẫn ảnh trong HTML và `ALBUM_PHOTOS` khi có album mới.

Nhấn vào hộp quà để mở popup “Hộp Quà Yêu Thương”: hai cột chú rể/cô dâu, QR đen trắng, tên chủ tài khoản, ngân hàng, số tài khoản và nút sao chép. Có thể đóng bằng nút Đóng, Escape hoặc chạm nền ngoài. Khi không sao chép tự động được, popup chọn số tài khoản để khách sao chép thủ công.

Các file `qr-groom-bidv.svg` và `qr-bride-vietcombank.svg` được tạo từ dữ liệu giải mã của hai JPEG gốc, giữ nguyên từng byte của mã chuyển khoản và vùng trắng 4 module. Đã đối chiếu payload sau khi render trên trình duyệt ở kích thước mobile; hai JPEG gốc vẫn được giữ trong `deploy/assets/`.

Nhạc cưới là [Ánh Nắng Của Anh (Chờ Em Đến Ngày Mai OST) — Đức Phúc](https://zingmp3.vn/bai-hat/Anh-Nang-Cua-Anh-Cho-Em-Den-Ngay-Mai-OST-Duc-Phuc/m7cEYB3NQrU9.html). Kiểm tra ngày 13/10/2026: Zing embed của bài `ZW78BW9D` chỉ hiện thẻ giới thiệu, không có trình phát. Website dùng [bản thu chính thức trên kênh Đức Phúc](https://www.youtube.com/watch?v=-GgTYmhzviw) để phát trong thiệp, đồng thời giữ link Zing gốc trong khung nhạc.

Nhạc mặc định tắt; iframe và YouTube IFrame API chỉ được tải sau khi khách nhấn Bật nhạc. Nếu tự phát bị chặn, khách nhấn Play trong khung nhạc. Nút Tắt nhạc hoặc dấu × gỡ iframe để dừng âm thanh; bật lại sẽ tải lại bài từ đầu. Iframe gửi referrer ở mức origin để đáp ứng yêu cầu YouTube, không gửi query tên khách. Trạng thái phát/tạm dừng được cập nhật từ sự kiện của YouTube; lỗi phát có thông báo và liên kết nghe trực tiếp.

Khi kiểm tra nhạc local, dùng `http://localhost:8000/` như hướng dẫn dưới. Đã xác minh bản thu phát trên origin `localhost`; YouTube có thể từ chối embed khi dùng địa chỉ IP `127.0.0.1`.

## Chạy local

```powershell
python -m http.server 8000 --directory deploy
```

Mở một trong hai URL:

```text
http://localhost:8000/
http://localhost:8000/?guest=B%E1%BA%A1n+Th%E1%BA%AFng+A3
```

Python static server chỉ kiểm tra được `/` và định dạng query `/?guest=...`; truy cập trực tiếp `/guest=...` sẽ trả 404 vì server này không áp dụng rewrite. Để kiểm tra đường dẫn chia sẻ dạng path và các redirect trước khi triển khai, chạy Netlify CLI:

```powershell
netlify dev
```

Sau đó mở URL theo cổng mà Netlify CLI thông báo, ví dụ:

```text
http://localhost:8888/guest=b%E1%BA%A1n+Th%E1%BA%AFng+A3
```

## Chỉnh nội dung

Thông tin ngày cưới, hai địa điểm và link Google Calendar nằm trong object `WEDDING` ở đầu:

```text
deploy/app.js
```

Tên hai gia đình, nội dung lời mời, QR ngân hàng và lời cảm ơn nằm trong:

```text
deploy/index.html
```

Ảnh và nền trang nằm trong:

```text
deploy/assets/
```

Ngày hiện tại của thiệp là **Chủ Nhật, 15/11/2026**, lúc **09:00**. Khi thay ngày, cần cập nhật đồng bộ nội dung tĩnh trong `index.html` và cấu hình lịch trong `app.js`.

## Supabase

Sổ lưu bút và RSVP dùng chung Supabase project:

```text
https://supabase.com/dashboard/project/fqafkaihbwgjqcabvisg
```

Chạy [supabase-wishes.sql](supabase-wishes.sql) trong Supabase SQL Editor khi khởi tạo database.

Các bảng:

- `wedding_wishes`: lưu tên, lời chúc, thời gian và trạng thái hiển thị.
- `wedding_rsvps`: lưu tên, tham dự/không tham dự và `guest_count` (1–10 người nếu tham dự, 0 nếu không tham dự). Cột `invitation_side` giữ giá trị `Th`/`Tr` của dữ liệu cũ; xác nhận mới gửi `null` vì không còn hỏi phía mời.

Với database đã có, chạy lại `supabase-wishes.sql` trước khi deploy. Script bổ sung `guest_count`, cho phép `invitation_side` rỗng, bỏ mặc định gán nhà trai và cập nhật quyền INSERT tương ứng. Các giá trị `Th`/`Tr` đã lưu trước đó được giữ nguyên. Client gửi rõ `invitation_side: null`, nên schema/RLS cũ cần được cập nhật trước khi nhận xác nhận mới.

Nếu Supabase SDK không tải được, trình duyệt lưu tạm lời chúc hoặc RSVP trong `localStorage` và giao diện thông báo rõ rằng dữ liệu chỉ có trên thiết bị.

## Deploy

Netlify được cấu hình trong [netlify.toml](netlify.toml):

```toml
[build]
  publish = "deploy"
```

Các URL legacy được redirect 301 về `/`. Đường dẫn `/guest=*` được rewrite nội bộ tới `/index.html` với status 200, vì vậy trình duyệt vẫn giữ nguyên URL chia sẻ có tên khách.

Repository hiện dùng nhánh `main`. Sau khi thay đổi đã được kiểm tra và push lên GitHub, Netlify sẽ redeploy theo cấu hình trong Netlify Dashboard.

## Kiểm tra nhanh

```powershell
node --check deploy/app.js
node --test tests/guest-name.test.cjs
python -m http.server 8000 --directory deploy
```

Kiểm tra tối thiểu:

- `/` mở thẳng thiệp đơn, không có màn hình chọn và hiển thị `Quý khách`.
- `/guest=b%E1%BA%A1n+Th%E1%BA%AFng+A3` hiển thị `Bạn Thắng A3` khi chạy qua Netlify.
- `/?guest=...` vẫn hiển thị đúng tên để tương thích với link cũ.
- Khi path và query cùng có tên, path thắng; tên rỗng hoặc malformed trở về `Quý khách`.
- Countdown hiển thị bốn ô và đếm đúng tới 09:00 ngày 15/11/2026 (UTC+7).
- Nhạc mặc định tắt; bật tạo đúng một iframe cho bản thu chính thức của Đức Phúc (`-GgTYmhzviw`), tắt gỡ iframe. Nếu bị chặn tự phát vẫn có nút Play và link mở trên YouTube hoặc Zing MP3.
- Hai link bản đồ và hai link thêm lịch mở đúng địa điểm.
- RSVP (gồm số lượng người) và lời chúc gửi thành công lên Supabase sau khi cập nhật schema.
- QR ngân hàng quét đúng tên và số tài khoản.
- Popup quà cưới mở/đóng đúng, sao chép đúng số tài khoản của từng bên và trả focus về nút mở khi đóng.
