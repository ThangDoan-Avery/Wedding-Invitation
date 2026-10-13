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
  hearts.js
  styles.css
  assets/
    Anh-nang-cua-anh.mp3
netlify.toml
supabase-wishes.sql
```

Website không dùng framework, package manager hoặc bước build. Netlify phục vụ trực tiếp thư mục `deploy`.

Trang `/` mở trực tiếp thiệp đơn và không còn card chọn phiên bản. Hai đường dẫn thiệp cũ dành riêng cho phía Thắng và Trang được redirect vĩnh viễn về `/`. Thiệp mới hiển thị cả hai địa điểm. Form RSVP chung chỉ hỏi tên, khả năng tham dự và số lượng người, không hỏi phía mời.

Layout hiện đi theo nhịp thiệp dọc 500px: thiệp hoa cá nhân hóa mở đầu, hero ảnh toàn trang, thông tin gia đình, báo hỷ, hai card tiệc cưới, hành trình xe cưới và timeline ngày cưới (09:00 Đón khách, 10:00 Khai tiệc, 11:00 Lễ thành hôn), lịch Save our date, ảnh Invitation với countdown, hai ảnh Love/You, ảnh dọc kèm RSVP, quà cưới, album carousel, lời chúc và ảnh cảm ơn. Nút Bật/Tắt nhạc nằm ở góc dưới bên phải.

Countdown có bốn ô ngày/giờ/phút/giây, cập nhật mỗi giây tới `2026-11-15T09:00:00+07:00`. Khi đến ngày cưới, bộ đếm dừng ở 0. Ảnh đang dùng tài nguyên có sẵn; thay từng đường dẫn ảnh trong HTML và `ALBUM_PHOTOS` khi có album mới.

Nhấn vào hộp quà để mở popup “Hộp Quà Yêu Thương”: hai cột chú rể/cô dâu, QR đen trắng, tên chủ tài khoản, ngân hàng, số tài khoản và nút sao chép. Có thể đóng bằng nút Đóng, Escape hoặc chạm nền ngoài. Khi không sao chép tự động được, popup chọn số tài khoản để khách sao chép thủ công.

Các file `qr-groom-bidv.svg` và `qr-bride-vietcombank.svg` được tạo từ dữ liệu giải mã của hai JPEG gốc, giữ nguyên từng byte của mã chuyển khoản và vùng trắng 4 module. Đã đối chiếu payload sau khi render trên trình duyệt ở kích thước mobile; hai JPEG gốc vẫn được giữ trong `deploy/assets/`.

Nhạc cưới dùng file cục bộ `deploy/assets/Anh-nang-cua-anh.mp3` do người dùng cung cấp và đã có trong dự án. Tài liệu này không xác minh hoặc khẳng định quyền tác giả hay quyền phân phối của file. Tên file phân biệt chữ hoa/chữ thường khi triển khai, vì vậy cần giữ chính xác chữ `A` viết hoa trong `Anh-nang-cua-anh.mp3`.

File hiện tại dài khoảng 50,2 giây và được phát lặp; có thể thay bằng bản đầy đủ cùng tên.

Phần tử `<audio id="weddingAudio" preload="metadata" loop>` phát trực tiếp file MP3 nội bộ, không tạo iframe, không tải YouTube API và không gửi yêu cầu nhạc tới dịch vụ bên ngoài. Trang thử `play()` ngay khi khởi tạo; nếu trình duyệt chặn autoplay, tương tác chạm/nhấp tin cậy đầu tiên sẽ thử lại và giao diện hiển thị thông báo ngắn nếu vẫn bị chặn hoặc phát sinh lỗi. Nút nhạc nhỏ gọn dùng để tạm dừng và phát tiếp tại đúng `currentTime`, không tải lại từ đầu. Khi khách chủ động tắt nhạc, trạng thái tắt được giữ nguyên và các thao tác chạm tiếp theo không tự bật lại.

Hiệu ứng trái tim tự chạy khi mở thiệp: 8 trái tim nhỏ màu hồng, rơi nhẹ trong phạm vi thiệp và không chặn thao tác. Nút hình tim góc dưới bên trái bật/tắt riêng hiệu ứng; số phần tử luôn giới hạn, không tăng dần khi để trang mở lâu. Khi đổi tab, hiệu ứng tạm dừng. Nếu thiết bị bật chế độ giảm chuyển động (`prefers-reduced-motion`), hiệu ứng và nút tim được ẩn. Mã hiệu ứng nằm trong `deploy/hearts.js`; hình tim SVG tự vẽ ở `deploy/assets/falling-heart.svg`.

Khi kiểm tra nhạc local, dùng `http://localhost:8000/` như hướng dẫn dưới và xác nhận `/assets/Anh-nang-cua-anh.mp3` trả về thành công. Không mở trực tiếp `index.html` bằng `file://`.

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
node --test tests/*.test.cjs
python -m http.server 8000 --directory deploy
```

Kiểm tra tối thiểu:

- `/` mở thẳng thiệp đơn, không có màn hình chọn và hiển thị `Quý khách`.
- `/guest=b%E1%BA%A1n+Th%E1%BA%AFng+A3` hiển thị `Bạn Thắng A3` khi chạy qua Netlify.
- `/?guest=...` vẫn hiển thị đúng tên để tương thích với link cũ.
- Khi path và query cùng có tên, path thắng; tên rỗng hoặc malformed trở về `Quý khách`.
- Countdown hiển thị bốn ô và đếm đúng tới 09:00 ngày 15/11/2026 (UTC+7).
- `#weddingAudio` dùng đúng `/assets/Anh-nang-cua-anh.mp3`, `preload="metadata"` và `loop`; không tạo iframe hoặc gọi YouTube API. Trang thử phát ngay, sau đó dùng tương tác tin cậy đầu tiên làm fallback nếu autoplay bị chặn. Thông báo blocked/error hiển thị rõ; nút nhạc pause/resume giữ nguyên `currentTime`, còn thao tác tắt thủ công ngăn các lần tự bật lại sau đó.
- Trái tim tự rơi, không cản nút/form; nút hình tim tắt/bật hiệu ứng. Đổi tab tạm dừng và chế độ giảm chuyển động ẩn hiệu ứng hoàn toàn.
- Hai link bản đồ và hai link thêm lịch mở đúng địa điểm.
- RSVP (gồm số lượng người) và lời chúc gửi thành công lên Supabase sau khi cập nhật schema.
- QR ngân hàng quét đúng tên và số tài khoản.
- Popup quà cưới mở/đóng đúng, sao chép đúng số tài khoản của từng bên và trả focus về nút mở khi đóng.
