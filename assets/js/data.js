/*
 * Контент сайта Spectre Studio.
 * Всё, что нужно менять (проекты, видео, контакты, тексты), — здесь.
 *
 * Тексты задаются на трёх языках: ru / uz (латиница) / en.
 *
 * Как добавить видео к проекту:
 *   video: { youtube: "ID_РОЛИКА" }   — например для https://youtu.be/dQw4w9WgXcQ это "dQw4w9WgXcQ"
 *   video: { vimeo: "123456789" }      — числовой ID ролика на Vimeo
 *   video: { file: "assets/video/имя.mp4" } — свой файл (трейлер), сжатый для веба
 *
 * still: "assets/img/stills/имя.jpg" — кадр из фильма: фон обложки и заставка плеера.
 *
 * Как добавить постер: положите файл в assets/img/posters/ и укажите
 *   poster: "assets/img/posters/hoshimov.jpg"
 * Пока постера нет, сайт рисует типографский постер автоматически.
 */

window.SITE = {
  // Шоурил: file — версия со звуком для кнопки «Шоурил»,
  // background — лёгкая версия без звука для фона главной.
  // Можно и { youtube: "ID" } или { vimeo: "ID" }.
  showreel: {
    file: "assets/video/showreel.mp4",
    background: "assets/video/showreel-bg.mp4?v=2",
    poster: "assets/img/stills/showreel.jpg"
  },

  // Все полные версии фильмов
  vimeoShowcase: "https://vimeo.com/showcase/12080332",

  founded: 2020,

  contacts: {
    email: "rasulov.sh92@gmail.com",
    phone: "+998 99 798 69 87",
    telegram: "Rasulov_Shokhrukh",
    instagram: "spectrestudio",
    city: { ru: "Ташкент, Узбекистан", uz: "Toshkent, O'zbekiston", en: "Tashkent, Uzbekistan" }
  },

  founder: {
    photo: "assets/img/founder.jpg",
    name: { ru: "Шохрух Расулов", uz: "Shohruh Rasulov", en: "Shokhrukh Rasulov" },
    role: {
      ru: "Основатель Spectre Studio · режиссёр, продюсер",
      uz: "Spectre Studio asoschisi · rejissyor, prodyuser",
      en: "Founder of Spectre Studio · Director, Producer"
    },
    bio: {
      ru: [
        "Шохрух Расулов — основатель киностудии Spectre Studio, режиссёр и продюсер. С 2019 года снимает документальное и игровое кино: портреты больших имён узбекской культуры, истории людей, которые служат своей стране, и художественные фильмы для широкого зрителя.",
        "Среди работ — документальные фильмы «Алишер Навоий» и «Абдулла Орипов», «Чиланзар: Душа столицы», игровые картины «Бир кунлик туй» и «Уч Кахрамон». В 2025 году студия выпустила документальный цикл «Эхо просвещения» (Whispers of Wisdom) с участием лауреата премии «Оскар» Бена Кингсли.",
        "Сейчас в производстве — художественный фильм «Хошимов» совместно с киноконцерном «Узбекфильм»."
      ],
      uz: [
        "Shohruh Rasulov — Spectre Studio kinostudiyasi asoschisi, rejissyor va prodyuser. 2019-yildan buyon hujjatli va badiiy filmlar suratga oladi: o'zbek madaniyatining buyuk siymolari haqidagi portret filmlar, Vatanga xizmat qilayotgan insonlar hikoyalari va keng tomoshabinga mo'ljallangan badiiy filmlar.",
        "Ishlari orasida — «Alisher Navoiy» va «Abdulla Oripov» hujjatli filmlari, «Chilonzor: Poytaxt qalbi», «Bir kunlik to'y» va «Uch qahramon» badiiy filmlari. 2025-yilda studiya «Oskar» mukofoti sohibi Ben Kingsli ishtirokidagi «Whispers of Wisdom» hujjatli turkumini chiqardi.",
        "Hozirda «O'zbekfilm» kinokonserni bilan hamkorlikda «Hoshimov» badiiy filmi ishlab chiqarilmoqda."
      ],
      en: [
        "Shokhrukh Rasulov is the founder of Spectre Studio, a director and producer. Since 2019 he has been making documentary and feature films: portraits of great names in Uzbek culture, stories of people who serve their country, and feature films for a wide audience.",
        "His work includes the documentaries “Alisher Navoi” and “Abdulla Aripov”, “Chilanzar: Soul of the Capital”, and the feature films “A One-Day Wedding” and “Three Heroes”. In 2025 the studio released the documentary series “Whispers of Wisdom” featuring Academy Award winner Sir Ben Kingsley.",
        "Currently in production: the feature film “Hoshimov”, co-produced with Uzbekfilm."
      ]
    }
  },

  clients: {
    sgb:        { ru: "Служба государственной безопасности Республики Узбекистан", uz: "O'zbekiston Respublikasi Davlat xavfsizlik xizmati", en: "State Security Service of the Republic of Uzbekistan" },
    prosecutor: { ru: "Генеральная прокуратура Республики Узбекистан", uz: "O'zbekiston Respublikasi Bosh prokuraturasi", en: "Prosecutor General's Office of the Republic of Uzbekistan" },
    mvd:        { ru: "Министерство внутренних дел Республики Узбекистан", uz: "O'zbekiston Respublikasi Ichki ishlar vazirligi", en: "Ministry of Internal Affairs of the Republic of Uzbekistan" },
    tax:        { ru: "Государственный налоговый комитет Республики Узбекистан", uz: "O'zbekiston Respublikasi Davlat soliq qo'mitasi", en: "State Tax Committee of the Republic of Uzbekistan" },
    anticorr:   { ru: "Агентство по противодействию коррупции Республики Узбекистан", uz: "O'zbekiston Respublikasi Korrupsiyaga qarshi kurashish agentligi", en: "Anti-Corruption Agency of the Republic of Uzbekistan" },
    cinema:     { ru: "Агентство кинематографии Республики Узбекистан", uz: "O'zbekiston Respublikasi Kinematografiya agentligi", en: "Cinematography Agency of the Republic of Uzbekistan" },
    uzbekfilm:  { ru: "Киноконцерн «Узбекфильм»", uz: "«O'zbekfilm» kinokonserni", en: "Uzbekfilm" },
    docstudio:  { ru: "ГУП «Киностудия документальных и хроникальных фильмов»", uz: "«Hujjatli va xronikal filmlar kinostudiyasi» DUK", en: "Documentary and Chronicle Film Studio" },
    cisc:       { ru: "Центр исламской цивилизации в Узбекистане", uz: "O'zbekistondagi Islom sivilizatsiyasi markazi", en: "Center for Islamic Civilization in Uzbekistan" },
    chilanzar:  { ru: "Хокимият Чиланзарского района", uz: "Chilonzor tumani hokimligi", en: "Chilanzar District Administration" },
    tiiame:     { ru: "НИУ «Ташкентский институт инженеров ирригации и механизации сельского хозяйства»", uz: "«Toshkent irrigatsiya va qishloq xo'jaligini mexanizatsiyalash muhandislari instituti» MTU", en: "TIIAME National Research University" },
    cec:        { ru: "Центральная избирательная комиссия Республики Узбекистан", uz: "O'zbekiston Respublikasi Markaziy saylov komissiyasi", en: "Central Election Commission of the Republic of Uzbekistan" },
    milliy:     { ru: "Демократическая партия «Миллий тикланиш»", uz: "«Milliy tiklanish» demokratik partiyasi", en: "Milliy Tiklanish Democratic Party" }
  },

  // Избранное на главной — в этом порядке
  featured: ["hoshimov", "uch-qahramon", "imom-al-buxoriy", "vijdon-saratoni", "abdulla-oripov", "whispers-of-wisdom"],

  // type: feature | doc | series | promo
  // Порядок здесь = порядок на странице «Работы» (сначала новые).
  projects: [
    {
      id: "hoshimov", year: 2026, type: "feature", status: "production",
      title: { ru: "Хошимов", uz: "Hoshimov", en: "Hoshimov" },
      clients: ["cinema", "uzbekfilm"]
    },
    {
      id: "whispers-of-wisdom", year: 2025, type: "series",
      title: { ru: "Эхо просвещения", uz: "Whispers of Wisdom", en: "Whispers of Wisdom" },
      note: {
        ru: "С участием лауреата премии «Оскар» сэра Бена Кингсли",
        uz: "«Oskar» mukofoti sohibi ser Ben Kingsli ishtirokida",
        en: "Featuring Academy Award winner Sir Ben Kingsley"
      },
      video: { file: "assets/video/whispers-of-wisdom.mp4" },
      still: "assets/img/stills/whispers-of-wisdom.jpg",
      clients: ["cisc"]
    },
    {
      id: "imom-al-buxoriy", year: 2025, type: "doc",
      title: { ru: "Имом ал-Бухорий мажмуаси", uz: "Imom al-Buxoriy majmuasi", en: "Imam al-Bukhari Complex" },
      video: { file: "assets/video/imom-al-buxoriy.mp4" },
      still: "assets/img/stills/imom-al-buxoriy.jpg",
      clients: ["cisc", "docstudio"]
    },
    {
      id: "uch-qahramon", year: 2024, type: "feature",
      title: { ru: "Уч Кахрамон", uz: "Uch qahramon", en: "Three Heroes" },
      video: { file: "assets/video/uch-qahramon.mp4" },
      still: "assets/img/stills/uch-qahramon.jpg",
      clients: ["mvd", "cinema"]
    },
    {
      id: "referendum", year: 2023, type: "promo",
      title: { ru: "Пишем историю вместе", uz: "Tariximizni birgalikda yozamiz", en: "Writing Our History Together" },
      note: {
        ru: "Социальный ролик к референдуму",
        uz: "Referendumga bag'ishlangan ijtimoiy rolik",
        en: "Social video for the referendum"
      },
      video: { file: "assets/video/referendum.mp4" },
      still: "assets/img/stills/referendum.jpg",
      clients: ["cec"]
    },
    {
      id: "evakuatsiya", year: 2023, type: "doc",
      title: { ru: "Эвакуация", uz: "Evakuatsiya", en: "Evacuation" },
      clients: ["cinema", "docstudio"]
    },
    {
      id: "xotira", year: 2023, type: "doc",
      title: { ru: "Хотира", uz: "Xotira", en: "Memory" },
      clients: ["tiiame"]
    },
    {
      id: "chilonzor", year: 2023, type: "doc",
      title: { ru: "Чиланзар: Душа столицы", uz: "Chilonzor: Poytaxt qalbi", en: "Chilanzar: Soul of the Capital" },
      clients: ["chilanzar", "cinema", "docstudio"]
    },
    {
      id: "adolat-manzili", year: 2022, type: "doc",
      title: { ru: "Адолат манзили", uz: "Adolat manzili", en: "The Address of Justice" },
      clients: ["prosecutor"]
    },
    {
      id: "vijdon-saratoni", year: 2022, type: "doc",
      title: { ru: "Виждон саратони", uz: "Vijdon saratoni", en: "Cancer of Conscience" },
      video: { file: "assets/video/vijdon-saratoni.mp4" },
      still: "assets/img/stills/vijdon-saratoni.jpg", stillPos: "65% 50%",
      clients: ["sgb", "anticorr"]
    },
    {
      id: "bir-kunlik-toy", year: 2021, type: "feature",
      title: { ru: "Бир кунлик туй", uz: "Bir kunlik to'y", en: "A One-Day Wedding" },
      clients: ["cinema"]
    },
    {
      id: "mustahkam", year: 2021, type: "doc",
      title: { ru: "Мустахкам", uz: "Mustahkam", en: "Steadfast" },
      video: { file: "assets/video/mustahkam.mp4" },
      still: "assets/img/stills/mustahkam.jpg",
      clients: ["sgb"]
    },
    {
      id: "inson", year: 2021, type: "doc",
      title: { ru: "Инсон", uz: "Inson", en: "Human" },
      clients: ["cinema"]
    },
    {
      id: "abdulla-oripov", year: 2021, type: "doc",
      title: { ru: "Абдулла Орипов", uz: "Abdulla Oripov", en: "Abdulla Aripov" },
      video: { file: "assets/video/abdulla-oripov.mp4" },
      still: "assets/img/stills/abdulla-oripov.jpg", stillPos: "30% 50%",
      clients: ["cinema", "docstudio", "tiiame"]
    },
    {
      id: "alisher-navoiy", year: 2021, type: "doc",
      title: { ru: "Алишер Навоий", uz: "Alisher Navoiy", en: "Alisher Navoi" },
      video: { file: "assets/video/alisher-navoiy.mp4" },
      still: "assets/img/stills/alisher-navoiy.jpg",
      clients: ["cinema", "docstudio"]
    },
    {
      id: "adiblar-xiyoboni", year: 2020, type: "doc",
      title: { ru: "Адиблар хиёбони", uz: "Adiblar xiyoboni", en: "Writers' Alley" },
      video: { file: "assets/video/adiblar-xiyoboni.mp4" },
      still: "assets/img/stills/adiblar-xiyoboni.jpg",
      clients: ["cinema"]
    },
    {
      id: "xalq-yuragi", year: 2020, type: "doc",
      title: { ru: "Халқ юраги", uz: "Xalq yuragi", en: "Heart of the People" },
      clients: ["cinema", "docstudio"]
    },
    {
      id: "nuqta", year: 2019, type: "promo",
      title: { ru: "Точка", uz: "Nuqta", en: "The Point" },
      note: {
        ru: "Цикл предвыборных социальных роликов",
        uz: "Saylovoldi ijtimoiy roliklar turkumi",
        en: "Pre-election social video campaign"
      },
      clients: ["milliy"]
    },
    {
      id: "kundalik", year: 2019, type: "doc",
      title: { ru: "Дневник", uz: "Kundalik", en: "The Diary" },
      clients: ["tiiame"]
    }
  ]
};
