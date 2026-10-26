import React from 'react';

function Brand({light = false}) {
  return <a className={`home-brand${light ? ' home-brand-light' : ''}`} href="/" aria-label="Dấu Chân Di Sản — Trang chủ">
    <span className="home-brand-mark" aria-hidden="true"><span>⌃</span><b>▥</b></span>
    <span className="home-brand-copy"><strong>DẤU CHÂN <em>DI SẢN</em></strong><small>HERITAGE ATLAS · HÀ NỘI</small></span>
  </a>;
}

export default function HomePage() {
  return <div className="home-page">
    <header className="home-nav">
      <Brand />
      <nav className="home-nav-links" aria-label="Điều hướng chính">
        <a className="current" href="/" aria-current="page">Trang chủ</a>
        <a href="#gioi-thieu">Giới thiệu</a>
        <a href="#/map">Bản đồ di sản</a>
      </nav>
      <a className="home-nav-cta" href="#/map">Khám phá bản đồ <span aria-hidden="true">↗</span></a>
    </header>

    <main>
      <section className="home-hero" aria-labelledby="home-title">
        <img className="home-hero-image" src="assets/van-mieu-home-hero.webp" alt="Minh họa Văn Miếu – Quốc Tử Giám giữa sắc hoa và nắng vàng" fetchPriority="high" />
        <div className="home-hero-shade" />
        <div className="home-hero-content">
          <div className="home-eyebrow"><span /> DI SẢN VĂN HÓA · HÀ NỘI</div>
          <h1 id="home-title">Chạm vào ký ức<br/><em>ngàn năm Thăng Long.</em></h1>
          <p>Khám phá những di tích, câu chuyện và hành trình văn hóa giữa lòng Hà Nội.</p>
          <a className="home-primary-cta" href="#/map">Bắt đầu khám phá <span aria-hidden="true">→</span></a>
        </div>
        <div className="home-hero-caption"><span>01 / 06</span><i /> VĂN MIẾU – QUỐC TỬ GIÁM</div>
        <a className="home-scroll-cue" href="#gioi-thieu" aria-label="Cuộn đến phần giới thiệu"><span /> CUỘN ĐỂ KHÁM PHÁ</a>
      </section>

      <section className="home-intro" id="gioi-thieu">
        <div className="home-intro-heading">
          <span className="home-section-label">MỘT HÀNH TRÌNH · NHIỀU LỚP THỜI GIAN</span>
          <h2>Mỗi di sản mở ra<br/><em>một câu chuyện Hà Nội.</em></h2>
        </div>
        <div className="home-intro-copy">
          <p>Từ Văn Miếu – Quốc Tử Giám đến những ngôi đình, ngôi chùa trong phố cũ, cùng lần theo dấu tích lịch sử bằng bản đồ tương tác và các tuyến tham quan tuyển chọn.</p>
          <a href="#/map">Mở bản đồ di sản <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section className="home-highlights" aria-label="Điểm nổi bật">
        <article><span className="home-number">01</span><div><h3>Bản đồ 2.5D</h3><p>Quan sát không gian di sản trên nền bản đồ Hà Nội.</p></div><a href="#/map" aria-label="Mở bản đồ 2.5D">↗</a></article>
        <article><span className="home-number">02</span><div><h3>Hành trình tuyển chọn</h3><p>Khám phá các điểm đến theo tuyến đi bộ và xe máy.</p></div><a href="#/map" aria-label="Xem các hành trình">↗</a></article>
        <article><span className="home-number">03</span><div><h3>Câu chuyện di sản</h3><p>Tìm hiểu địa danh cùng thông tin vị trí và nguồn tham khảo.</p></div><a href="#/map" aria-label="Đọc câu chuyện di sản">↗</a></article>
      </section>
    </main>

    <footer className="home-footer"><Brand light/><span>Gìn giữ dấu xưa, tiếp nối hành trình.</span><a href="#/map">Bản đồ di sản <span aria-hidden="true">↗</span></a></footer>
  </div>;
}
