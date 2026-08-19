// ==UserScript==
// @name         EmploMaster 1.0
// @namespace    EmploMaster 1.0
// @version      1.0
// @author       MJU
// @description  Automatyczne formatki (wklejki) na stronie wniosku emplo — rozpoznaje wnioski o dostęp do Perfect Gym
// @match        https://bsof.emplo.com/*
// @match        https://cp.home.pl/*
// @match        https://panel.home.pl/*
// @match        https://*.perfectgym.pl/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addValueChangeListener
// @run-at       document-idle
// @updateURL    https://github.com/Restian5/TestowyRestian/raw/refs/heads/main/wklejki-fitmeet-emplo.user.js
// @downloadURL  https://github.com/Restian5/TestowyRestian/raw/refs/heads/main/wklejki-fitmeet-emplo.user.js
// ==/UserScript==

(function () {
  "use strict";

  // ======================= CONFIG =======================
  const CONFIG = {
    DOMENA: "bsof.com.pl",
    ETYKIETA_PG: "Jeżeli ma zostać przyznany dostęp do Perfect Gym", // po tym rozpoznajemy wniosek
  };
  // ======================================================

  const roles = [
    { label: "Trener",
      extra: ["Dodano do listy trenerów, przyznano umiejętności SW, IT oraz TP."], haslo: true, login: true },
    { label: "Trener+Recepcja",
      extra: ["Dodano do listy trenerów, przyznano umiejętności SW, IT oraz TP."], haslo: true, login: true },
    { label: "Trener personalny",
      extra: ["Dodano do listy trenerów, przyznano umiejętności SW, IT oraz TP."], haslo: true, login: true },
    { label: "Recepcja", extra: [], haslo: true, login: true },
    { label: "IZG", extra: ["Dodano do listy trenerów."], haslo: true, login: false },
    { label: "Instruktor Fitness", extra: ["Dodano do listy trenerów."], haslo: true, login: false },
    { label: "Master Trener",
      extra: ["Dodano do listy trenerów, przyznano umiejętności SW, IT oraz TP."], haslo: true, login: true },
    { label: "Menadżer Klubu", extra: [], haslo: true, login: true },
    { label: "Menadżer Regionalny", extra: [], haslo: true, login: true },
    { label: "Zastępca Menadżera Klubu (ZMK)", extra: [], haslo: true, login: true },
    { label: "Menadżer Fitness", extra: [], haslo: true, login: true },
    { label: "DOK", extra: [], haslo: true, login: true },
    { label: "Księgowi", extra: [], haslo: true, login: true },
    { label: "Fizjoterapeuta", extra: ["Dodano do listy trenerów."], haslo: true, login: false },
  ];

  const SYG_KEY = "wklejki_sygnatura";

  // Czy dany typ konta ma w ogóle login do PG? (IZG i Fizjoterapeuta — "bez logowania")
  function wymagaLoginu(typ) {
    const r = roles.find(x => x.label === typ);
    return r ? r.login : true;
  }

  // Instancje Perfect Gym: [nazwa (słowo klucz 1 — szukane w całym wniosku),
  //                         kod (słowo klucz 2 — szukany TYLKO w klubie macierzystym),
  //                         adres instancji]
  const INSTANCJE = [
    ["Zdrofit",        "ZF",  "https://zdrofit.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
    ["MyFitnessPlace", "MFP", "https://myfitnessplace.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
    ["FitFabric",      "FiF", "https://fitfabric.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
    ["FabrykaFormy",   "FF",  "https://fabrykaformy.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
    ["FitnessAcademy", "FA",  "https://fitnessacademy.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
    ["SaturnFitness",  "SF",  "https://saturnfitness.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
    ["Artis",          null,  "https://artis.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
    ["TotalFitness",   "TF",  "https://totalfitness.perfectgym.pl/Pgm/#/Clubs/Web//SystemMan/Employees/Employees.aspx"],
  ];
  const STAN_KEY = "wkf_stan";
  // Pamięć ostatnich 3 skrzynek, które MY sami założyliśmy (nie takich, które już
  // istniały wcześniej) — potrzebne, żeby przy EDYCJI konta w PG wiedzieć, czy
  // dopisać "Hasło do Home" do wklejki, czy nie (zwykle przy edycji skrzynka już
  // istnieje od dawna i nikt nie zna/nie potrzebuje jej hasła).
  const OSTATNIE_SKRZYNKI_KEY = "wkf_ostatnie_skrzynki";
  function zapamietajZalozonaSkrzynke(lg) {
    let lista = [];
    try { lista = JSON.parse(gmOdczytaj(OSTATNIE_SKRZYNKI_KEY) || "[]"); } catch (e) {}
    lista = lista.filter(x => x !== lg); // bez duplikatów
    lista.unshift(lg);
    lista = lista.slice(0, 3); // tylko 3 ostatnie
    gmZapisz(OSTATNIE_SKRZYNKI_KEY, JSON.stringify(lista));
  }
  function czyNiedawnoZalozonaSkrzynka(lg) {
    let lista = [];
    try { lista = JSON.parse(gmOdczytaj(OSTATNIE_SKRZYNKI_KEY) || "[]"); } catch (e) {}
    return lista.includes(lg);
  }
  // Trzy różne strony po stronie Home: właściwe zarządzanie skrzynkami, ekran
  // logowania (gdy sesja wygasła) i strona pośrednia (np. dashboard) po zalogowaniu,
  // z której trzeba dopiero przejść do zarządzania skrzynkami
  const NA_HOME = location.hostname === "cp.home.pl" && location.pathname.includes("/mailboxes/mailboxes");
  const NA_HOME_LOGIN = location.hostname === "panel.home.pl";
  const NA_HOME_POSREDNIA = location.hostname === "cp.home.pl" && !NA_HOME;
  const NA_PG = /\.perfectgym\.pl$/.test(location.hostname);
  const NA_PG_LOGIN = NA_PG && location.hash.toLowerCase().includes("/login");
  const ODBIORCA = NA_HOME || NA_PG; // strony, które tylko odbierają dane z emplo
  const HOME_URL = "https://cp.home.pl/ccp/v/home.pl/mailboxes/mailboxes";

  // Klucze GM do zapamiętania "chcę dokończyć X po przejściu na inną stronę/domenę"
  const AUTO_HOME_KEY = "wkf_auto_home";
  const AUTO_HOME_TS_KEY = "wkf_auto_home_ts";
  const AUTO_TYP_KEY = "wkf_auto_pg_typ";
  const AUTO_TS_KEY = "wkf_auto_pg_ts";
  const AUTO_AKCJA_KEY = "wkf_auto_pg_akcja"; // "utworz" albo "edytuj" — co zrobić po dotarciu na instancję
  // Auto-zakończenie: po powrocie do emplo, automatyczne wklejenie wklejki jako
  // komentarza i zapisanie go
  const AUTO_KOMENTARZ_KEY = "wkf_auto_komentarz";
  const AUTO_KOMENTARZ_TS_KEY = "wkf_auto_komentarz_ts";
  const POWROT_WKLEJKA_KEY = "wkf_powrot_wklejka_tekst"; // sam tekst gotowej wklejki, do wykorzystania po powrocie na emplo
  const POKAZ_PRZYCISK_KEY = "wkf_pokaz_przycisk_wklejki"; // gdy auto-komentarz wyłączony — pokaż widoczny przycisk kopiowania
  const POKAZ_PRZYCISK_TS_KEY = "wkf_pokaz_przycisk_wklejki_ts";
  const AUTO_UMIEJ_LOGIN_KEY = "wkf_auto_umiej_login";
  const AUTO_UMIEJ_TS_KEY = "wkf_auto_umiej_ts";
  const AUTO_UMIEJ_LISTA_KEY = "wkf_auto_umiej_lista";
  const AUTO_UMIEJ_ROLA_KEY = "wkf_auto_umiej_rola";
  // "Cały proces": obie karty (Home i PG) otwierają się RAZEM, synchronicznie w tym
  // samym kliknięciu (przeglądarka nie blokuje wtedy window.open) — karta PG czeka
  // na wynik z Home (poniższe klucze), zamiast Home próbować otworzyć PG asynchronicznie
  // (co przeglądarka po prostu cicho blokuje jako "nie-user-gesture" popup)
  // Zamiar kontynuacji: po sukcesie na Home, ta SAMA karta ma przejść (nawigować) na PG
  // i tam założyć konto — unika to blokowania drugiego okna przez przeglądarkę.
  const CHAIN_PG_TYP_KEY = "wkf_chain_pg_typ";
  const CHAIN_PG_TS_KEY = "wkf_chain_pg_ts";

  // Wspólna pamięć Tampermonkey — działa między emplo a home.pl
  function gmZapisz(k, v) { try { GM_setValue(k, v); } catch (e) { try { localStorage.setItem(k, v); } catch (e2) {} } }
  function gmOdczytaj(k) {
    try { const v = GM_getValue(k); if (v !== undefined && v !== null) return v; } catch (e) {}
    try { return localStorage.getItem(k) || ""; } catch (e) { return ""; }
  }
  function zapiszStan() {
    gmZapisz(STAN_KEY, JSON.stringify({ ...state, funkcjaZWniosku, ts: Date.now() }));
  }
  function wczytajStan() {
    try {
      const d = JSON.parse(gmOdczytaj(STAN_KEY) || "{}");
      for (const k of ["imie", "klub", "haslo", "sufiks", "id", "instNazwa", "instUrl", "typ", "wniosekId"]) if (d[k]) state[k] = d[k];
      if (d.funkcjaZWniosku) funkcjaZWniosku = d.funkcjaZWniosku;
    } catch (e) {}
  }

  // ---------- pomocnicze ----------
  function bezPolskich(s) {
    const map = { "ą":"a","ć":"c","ę":"e","ł":"l","ń":"n","ó":"o","ś":"s","ź":"z","ż":"z",
                  "Ą":"A","Ć":"C","Ę":"E","Ł":"L","Ń":"N","Ó":"O","Ś":"S","Ź":"Z","Ż":"Z" };
    return s.replace(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/g, ch => map[ch]);
  }
  function ladnaForma(s) {
    // "aDAM nOWAK" / "ADAM NOWAK" -> "Adam Nowak" (także myślniki)
    return s.trim().toLowerCase().replace(/(^|[\s-])(\S)/g, (m, sep, ch) => sep + ch.toUpperCase());
  }
  function generujHaslo() {
    const znaki = "abcdefghijklmnpqrstuvwxyzABCDEFGHJKLMNOPQRSTUVWXYZ123456789";
    const dlugosc = 8 + (crypto.getRandomValues(new Uint8Array(1))[0] % 2);
    const buf = crypto.getRandomValues(new Uint8Array(dlugosc));
    let h = "";
    for (const b of buf) h += znaki[b % znaki.length];
    return h;
  }

  // Hasło do PG ma INNE wymogi niż hasło do Home: min. 6 znaków, co najmniej
  // 1 znak specjalny i co najmniej 1 duża litera — gwarantujemy to jawnie,
  // zamiast liczyć na przypadek (jak przy generujHaslo() dla Home).
  function generujHasloPG() {
    const losowyZ = (znaki) => znaki[crypto.getRandomValues(new Uint8Array(1))[0] % znaki.length];
    const male = "abcdefghijklmnpqrstuvwxyz";
    const duze = "ABCDEFGHJKLMNPQRSTUVWXYZ";
    const cyfry = "23456789";
    const specjalne = "!@#$%&*?";
    const wszystkie = male + duze + cyfry + specjalne;

    // gwarantowane składniki: 1 duża litera, 1 znak specjalny, reszta losowo
    // z pełnej puli, łącznie 9 znaków (bezpiecznie powyżej wymaganych 6)
    const znakiHasla = [losowyZ(duze), losowyZ(specjalne), losowyZ(male), losowyZ(cyfry)];
    while (znakiHasla.length < 9) znakiHasla.push(losowyZ(wszystkie));

    // przetasowanie (Fisher–Yates) — żeby duża litera/znak specjalny nie były
    // zawsze na tych samych, przewidywalnych pozycjach
    for (let i = znakiHasla.length - 1; i > 0; i--) {
      const j = crypto.getRandomValues(new Uint8Array(1))[0] % (i + 1);
      [znakiHasla[i], znakiHasla[j]] = [znakiHasla[j], znakiHasla[i]];
    }
    return znakiHasla.join("");
  }

  // ---------- odczyt danych ze strony ----------
  function liniiStrony() {
    return document.body.innerText.split(/\r?\n/).map(l => l.trim());
  }
  function wartoscPoEtykiecie(lines, etykieta) {
    const idx = lines.findIndex(l => l.toLowerCase().startsWith(etykieta.toLowerCase()));
    if (idx === -1) return "";
    const wTejLinii = lines[idx].split(":").slice(1).join(":").trim();
    if (wTejLinii) return wTejLinii;
    for (let j = idx + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l || l === "-") continue;
      if (l.toLowerCase().startsWith("uzupełnij")) continue;
      if (l.endsWith(":")) return "";
      return l;
    }
    return "";
  }
  // Jak wyżej, ale zbiera WIELE kolejnych linii wartości zamiast tylko pierwszej —
  // potrzebne tam, gdzie długa wartość (np. nazwa klubu) potrafi się wizualnie
  // zawinąć na 2 linie w innerText. Używać TYLKO tam, gdzie to naprawdę potrzebne
  // (nie dla krótkich pól typu imię i nazwisko — tam wystarczy jedna linia).
  function wartoscWieloliniowaPoEtykiecie(lines, etykieta) {
    const idx = lines.findIndex(l => l.toLowerCase().startsWith(etykieta.toLowerCase()));
    if (idx === -1) return "";
    const wTejLinii = lines[idx].split(":").slice(1).join(":").trim();
    if (wTejLinii) return wTejLinii;
    const czesci = [];
    for (let j = idx + 1; j < lines.length; j++) {
      const l = lines[j];
      if (!l || l === "-") { if (czesci.length) break; else continue; }
      if (l.toLowerCase().startsWith("uzupełnij")) { if (czesci.length) break; else continue; }
      if (l.endsWith(":")) break; // następna etykieta
      czesci.push(l);
      if (czesci.length >= 5) break; // zabezpieczenie przed połknięciem zbyt wielu linii
    }
    return czesci.join(" ").trim();
  }
  function wyluskajKlub(klubPelny) {
    // Wczytujemy pełną nazwę klubu dokładnie tak, jak stoi we wniosku
    return klubPelny.trim();
  }
  function wartosciPoEtykiecie(lines, etykieta) {
    // Zbiera WSZYSTKIE linie wartości pod etykietą (np. kilka zaznaczonych funkcji),
    // aż do następnej etykiety (linii kończącej się dwukropkiem)
    const idx = lines.findIndex(l => l.toLowerCase().startsWith(etykieta.toLowerCase()));
    if (idx === -1) return [];
    const wyniki = [];
    for (let j = idx + 1; j < lines.length && wyniki.length < 8; j++) {
      const l = lines[j];
      if (!l || l === "-") continue;
      if (l.endsWith(":")) break; // następna etykieta
      wyniki.push(l);
    }
    return wyniki;
  }
  // Odczyt bezpośrednio ze struktury DOM tego szablonu wniosku emplo:
  // <div class="text-break text-wrap"><b>Etykieta:</b></div>
  // <div class="text-break text-wrap ...">WARTOŚĆ</div>
  // Dużo pewniejsze niż dzielenie całego tekstu strony na linie — bo nie zależy
  // od tego, jak dana wartość wizualnie się zawinie czy jakie białe znaki zawiera.
  function wartoscZDomPoEtykiecie(etykieta) {
    const k = norm(etykieta);
    const divy = [...document.querySelectorAll("div.text-break.text-wrap")];
    const labelDiv = divy.find(d => {
      const b = d.querySelector(":scope > b");
      return b && norm(b.textContent).startsWith(k);
    });
    if (!labelDiv) return "";
    let sib = labelDiv.nextElementSibling;
    while (sib && !sib.textContent.trim()) sib = sib.nextElementSibling;
    if (!sib) return "";
    return sib.textContent.replace(/\s+/g, " ").trim();
  }
  function czytajWniosek() {
    const lines = liniiStrony();
    const imie = wartoscZDomPoEtykiecie("Imię i nazwisko") || wartoscPoEtykiecie(lines, "Imię i nazwisko");
    const klubPelny = wartoscZDomPoEtykiecie("Klub macierzysty") || wartoscWieloliniowaPoEtykiecie(lines, "Klub macierzysty");
    const funkcjePG = wartosciPoEtykiecie(lines, CONFIG.ETYKIETA_PG);
    const tytul = wartoscZDomPoEtykiecie("Tytuł wniosku") || wartoscPoEtykiecie(lines, "Tytuł wniosku");
    return { imie: ladnaForma(imie), klub: wyluskajKlub(klubPelny), funkcjaPG: funkcjePG.join(" | "), tytul };
  }
  function toWniosekPG() {
    const lines = liniiStrony();
    return lines.some(l => l.toLowerCase().startsWith(CONFIG.ETYKIETA_PG.toLowerCase()));
  }
  function dopasujRole(funkcjaPG) {
    // Kolejność ma znaczenie: gdy zaznaczono kilka funkcji,
    // wygrywa bardziej szczegółowa kombinacja
    let f = bezPolskich((funkcjaPG || "").toLowerCase()).replace(/\s+/g, " ");
    // "trener", "trener zmianowy", "trener floor", "fitness", "floor" — to wszystko Trener
    // (ale "menadzer fitness" i "master trener" mają WŁASNE, bardziej szczegółowe reguły niżej)
    const maTrenera = f.includes("trener") || f.includes("fitness") || f.includes("floor");
    const maRecepcje = f.includes("recepcj") || f.includes("obsluga klienta");

    if (f.includes("master trener")) return "Master Trener";
    if (f.includes("personaln")) return "Trener personalny";
    if (maTrenera && maRecepcje) return "Trener+Recepcja";
    // "Instruktor Fitness" to w praktyce to samo co IZG — sprawdzamy tę FRAZĘ przed
    // ogólnym dopasowaniem samego słowa "fitness" do Trenera (inaczej złapałoby jako Trener)
    if (f.includes("instruktor fitness")) return "Instruktor Fitness";
    if (f.includes("instruktor zajec grupowych") || f.includes("izg")) return "IZG";
    if (f.includes("zastepca menadzera klubu") || f.includes("zmk")) return "Zastępca Menadżera Klubu (ZMK)";
    if (f.includes("dom/menadzer regionalny") || f.includes("menadzer regionalny")) return "Menadżer Regionalny";
    if (f.includes("menadzer klubu")) return "Menadżer Klubu";
    if (f.includes("menadzer fitness")) return "Menadżer Fitness";
    if (f.includes("dok + korpo portal plus") || f.includes("dok+korpo portal plus")) return "DOK";
    if (f.includes("ksiegowi") || f.includes("ksiegowa") || f.includes("ksiegowy")) return "Księgowi";
    // Fizjoterapeuta — ale NIE gdy to tylko wzmianka w polu "Numer prawa wykonywania
    // zawodu (fizjoterapeuta)", które jest zupełnie innym polem formularza
    const fBezWyjatku = f.replace(/numer prawa wykonywania zawodu\s*\(fizjoterapeuta\)/g, "");
    if (fBezWyjatku.includes("fizjoterapeuta")) return "Fizjoterapeuta";
    if (maRecepcje) return "Recepcja";
    if (maTrenera) return "Trener";
    return null;
  }

  // Jak dopasujRole(), ale dla TYTUŁU wniosku — czyli dowolnego, swobodnego tekstu
  // (nie ustandaryzowanych zaznaczeń checkboxów funkcji PG). Tam szerokie słowa-klucze
  // (samo "fitness" albo "floor") dają zbyt dużo fałszywych trafień — np. "instruktor
  // fitness" to zwykły opis stanowiska w tytule, nie sygnał typu konta "Trener". Dla
  // tytułu wymagamy więc DOSŁOWNIE słowa "trener", nie samego "fitness"/"floor".
  function dopasujRoleZTytulu(tytul) {
    let f = bezPolskich((tytul || "").toLowerCase()).replace(/\s+/g, " ");
    const maTrenera = f.includes("trener"); // BEZ samego "fitness"/"floor" — za mało pewne w luźnym tytule
    const maRecepcje = f.includes("recepcj") || f.includes("obsluga klienta");

    if (f.includes("master trener")) return "Master Trener";
    if (f.includes("personaln") && f.includes("trener")) return "Trener personalny";
    if (maTrenera && maRecepcje) return "Trener+Recepcja";
    // "Instruktor Fitness" to w praktyce to samo co IZG — ta fraza ma pierwszeństwo
    if (f.includes("instruktor fitness")) return "Instruktor Fitness";
    if (f.includes("instruktor zajec grupowych") || f.includes("izg")) return "IZG";
    if (f.includes("zastepca menadzera klubu") || f.includes("zmk")) return "Zastępca Menadżera Klubu (ZMK)";
    if (f.includes("dom/menadzer regionalny") || f.includes("menadzer regionalny")) return "Menadżer Regionalny";
    if (f.includes("menadzer klubu")) return "Menadżer Klubu";
    if (f.includes("menadzer fitness")) return "Menadżer Fitness";
    if (f.includes("dok + korpo portal plus") || f.includes("dok+korpo portal plus")) return "DOK";
    if (f.includes("ksiegowi") || f.includes("ksiegowa") || f.includes("ksiegowy")) return "Księgowi";
    const fBezWyjatku = f.replace(/numer prawa wykonywania zawodu\s*\(fizjoterapeuta\)/g, "");
    if (fBezWyjatku.includes("fizjoterapeuta")) return "Fizjoterapeuta";
    if (maRecepcje) return "Recepcja";
    if (maTrenera) return "Trener";
    return null;
  }

  // Weryfikacja spójności wniosku — dwa niezależne sprawdzenia:
  // 1) czy funkcja wspomniana w TYTULE wniosku zgadza się z funkcją zaznaczoną
  //    pod pytaniem o dostęp do PG (jeśli tytuł w ogóle nie wspomina żadnej
  //    rozpoznawalnej funkcji — nie ma sprzeczności),
  // 2) czy jednocześnie NIE zaznaczono kombinacji funkcji, które się nie łączą
  //    w żaden zdefiniowany typ konta (np. Recepcja + Trener personalny —
  //    w odróżnieniu od Trener floor + Recepcja, co jest zdefiniowanym
  //    "Trener+Recepcja" i jest jak najbardziej w porządku).
  // Wyjątek dotyczy TYLKO sytuacji, gdy tytuł mówi ogólnie "Trener" (najmniej
  // szczegółowy, "bazowy" wariant) — to nie jest sprzeczność, tylko mniejsza
  // szczegółowość tytułu. Jeśli tytuł wprost wskazuje KONKRETNY wariant (np.
  // "Master Trener", "Trener personalny"), musi się on zgadzać dokładnie z tym,
  // co faktycznie zaznaczono — inaczej to prawdziwa sprzeczność (np. tytuł mówi
  // "Master Trener", a zaznaczono tylko Trener floor + Trener personalny — bez
  // żadnej wzmianki o "Master").
  const RODZINA_TRENER = ["Trener", "Trener+Recepcja", "Trener personalny", "Master Trener"];

  function sprawdzSpojnoscWniosku(tytul, funkcjaPG) {
    const zTytulu = dopasujRoleZTytulu(tytul);
    const zFunkcji = dopasujRole(funkcjaPG);
    if (zTytulu && zFunkcji && zTytulu !== zFunkcji &&
        !(zTytulu === "Trener" && RODZINA_TRENER.includes(zFunkcji))) {
      return { ok: false, opis: "Tytuł wniosku wskazuje na funkcję \"" + zTytulu +
        "\", a zaznaczona funkcja pod dostępem do PG to \"" + zFunkcji + "\"." };
    }

    const f = bezPolskich((funkcjaPG || "").toLowerCase()).replace(/\s+/g, " ");
    const maRecepcje = f.includes("recepcj") || f.includes("obsluga klienta");
    const maPersonalny = f.includes("personaln");
    if (maRecepcje && maPersonalny) {
      return { ok: false, opis: "Zaznaczono jednocześnie Recepcję i Trenera personalnego — te funkcje NIE łączą się w jeden typ konta (w odróżnieniu od Trener floor + Recepcja)." };
    }

    return { ok: true };
  }

  // ---------- stan ----------
  const state = { imie: "", klub: "", haslo: "", sufiks: "", id: "", instNazwa: "", instUrl: "", typ: "", wniosekId: "" };

  // ---------- ustawienia (login/hasło na przyszłość + blokada przesuwania) ----------
  // UWAGA: to NIE jest prawdziwe szyfrowanie — GM_setValue jest niewidoczne dla stron
  // internetowych (w odróżnieniu od localStorage), ale nie chroni przed kimś, kto ma
  // dostęp do tej przeglądarki/profilu.
  const USTAWIENIA_KEY = "wkf_ustawienia";
  function wczytajUstawienia() {
    let u = {};
    try { u = JSON.parse(gmOdczytaj(USTAWIENIA_KEY) || "{}"); } catch (e) {}
    if (u.zablokowane === undefined) u.zablokowane = true; // domyślnie zablokowane
    return u;
  }
  function zapiszUstawienia() { gmZapisz(USTAWIENIA_KEY, JSON.stringify(ustawienia)); }
  const ustawienia = wczytajUstawienia();
  if (!ustawienia.motyw) ustawienia.motyw = "zielony";
  // Migracja starego pola boolean "ciemny" -> nowy 3-stanowy "tryb" (jak w Windows)
  if (!ustawienia.tryb) ustawienia.tryb = ustawienia.ciemny ? "ciemny" : "jasny";
  if (!ustawienia.skala) ustawienia.skala = 1;
  if (ustawienia.autoPrzelaczanie === undefined) ustawienia.autoPrzelaczanie = false;
  if (ustawienia.autoZakonczenie === undefined) ustawienia.autoZakonczenie = false;

  // Predefiniowane motywy kolorystyczne (akcent + wersja ciemniejsza do hover)
  const MOTYWY = {
    zielony:     { nazwa: "Zielony",     akcent: "#0f6f5c", akcentCiemny: "#0c5a4b" },
    niebieski:   { nazwa: "Niebieski",   akcent: "#2563eb", akcentCiemny: "#1d4ed8" },
    fioletowy:   { nazwa: "Fioletowy",   akcent: "#7c3aed", akcentCiemny: "#6d28d9" },
    pomaranczowy:{ nazwa: "Pomarańczowy",akcent: "#ea580c", akcentCiemny: "#c2410c" },
    rozowy:      { nazwa: "Różowy",      akcent: "#db2777", akcentCiemny: "#be185d" },
    grafitowy:   { nazwa: "Grafitowy",   akcent: "#334155", akcentCiemny: "#1e293b" },
  };

  function czyCiemnySystemowo() {
    try { return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches; }
    catch (e) { return false; }
  }

  // Stosuje motyw/skalę/tryb GLOBALNIE (na :root), więc obejmuje jednocześnie
  // panel i pływającą ikonkę (to dwa osobne elementy w DOM, ale współdzielą zmienne CSS)
  function zastosujMotyw(u) {
    u = u || ustawienia;
    const m = MOTYWY[u.motyw] || MOTYWY.zielony;
    const root = document.documentElement.style;
    root.setProperty("--wkf-accent", m.akcent);
    root.setProperty("--wkf-accent-dark", m.akcentCiemny);
    root.setProperty("--wkf-scale", String(u.skala || 1));
    const ciemny = u.tryb === "systemowy" ? czyCiemnySystemowo() : u.tryb === "ciemny";
    if (ciemny) {
      root.setProperty("--wkf-bg", "#1c2128");
      root.setProperty("--wkf-fg", "#e6e8eb");
      root.setProperty("--wkf-fg-muted", "#9aa4b2");
      root.setProperty("--wkf-border", "#343b46");
      root.setProperty("--wkf-input-bg", "#262c35");
      root.setProperty("--wkf-card-bg", "#262c35");
      root.setProperty("--wkf-accent-soft", "rgba(255,255,255,.08)");
    } else {
      root.setProperty("--wkf-bg", "#f6f4ee");
      root.setProperty("--wkf-fg", "#1b2733");
      root.setProperty("--wkf-fg-muted", "#6b7280");
      root.setProperty("--wkf-border", "#d8d3c6");
      root.setProperty("--wkf-input-bg", "#fdfcf9");
      root.setProperty("--wkf-card-bg", "#ffffff");
      root.setProperty("--wkf-accent-soft", "#e2f0ec");
    }
  }
  // Gdy tryb="systemowy" i użytkownik przełączy jasny/ciemny w systemie na żywo —
  // podążamy za tym bez przeładowania
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      if (ustawienia.tryb === "systemowy") zastosujMotyw();
    });
  } catch (e) {}

  // Frazy wykluczone z wykrywania instancji — występują w innych kontekstach
  // (pytania o fizjoterapeutów / Optimed) i nie oznaczają instancji PG
  const WYKLUCZENIA_INSTANCJI = [
    "zdrofit zdrowe miejsce",
  ];

  function wykryjInstancje(pelnyTekst, klub) {
    // 1) słowo klucz 1 (pełna nazwa) — w całym dokumencie, bez rozróżniania wielkości liter,
    //    ale po usunięciu fraz z innych kontekstów (np. "Zdrofit Zdrowe Miejsce")
    let t = (pelnyTekst || "").toLowerCase();
    for (const fraza of WYKLUCZENIA_INSTANCJI) t = t.split(fraza).join(" ");
    for (const [nazwa, kod, url] of INSTANCJE) {
      if (t.includes(nazwa.toLowerCase())) return { nazwa, url };
    }
    // 2) słowo klucz 2 (kod) — TYLKO w klubie macierzystym, jako osobny token
    //    (np. "ZF Wilanów Syta | ZF_ZF_524" → tokeny: ZF, Wilanów, Syta, ZF, ZF, 524)
    const tokeny = (klub || "").split(/[\s|_\-\/\\.,()]+/).filter(Boolean);
    for (const [nazwa, kod, url] of INSTANCJE) {
      if (kod && tokeny.some(tk => tk.toLowerCase() === kod.toLowerCase())) return { nazwa, url };
    }
    return null;
  }
  let funkcjaZWniosku = "";
  let pokazWszystkie = false;
  let wniosekBledny = null; // null = OK; obiekt {zTytulu, zFunkcji} = sprzeczność tytułu z funkcją PG
  let aktualizujBanerBledu = null; // przypisywana w buildPanel (tylko na emplo)
  let identyfikacjaTypu = null; // "normalna" | "tytul" (awaryjnie) | "brak" (wcale)
  let aktualizujBanerIdentyfikacji = null; // przypisywana w buildPanel (tylko na emplo)
  let aktualizujBanerKomentarzy = null; // przypisywana w buildPanel (tylko na emplo)

  // Login BAZOWY, bez sufiksu — to zawsze jest adres e-mail (wspólny dla wszystkich
  // kont danej osoby, nawet jeśli ma kilka kont PG z różnymi loginami/sufiksami)
  function loginBazowy() {
    const parts = bezPolskich(state.imie.trim().toLowerCase()).split(/\s+/).filter(Boolean);
    return parts.join(".");
  }
  function login() {
    const base = loginBazowy();
    return base && state.sufiks ? base + state.sufiks : base;
  }
  function sygnatura() {
    let s = (gmOdczytaj(SYG_KEY) || "").trim();
    s = s.replace(/^\[+/, "").replace(/\]+$/, "");
    return s ? `[${s}]` : "";
  }
  // Trwale zapisywane (nie tylko w zmiennej JS!), gdy podczas EDYCJI trzeba było
  // nadać nowe hasło do PG (przejście z typu bez loginu, np. IZG, na typ z loginem)
  // — dopisywane do wklejki jako dodatkowa linia. MUSI przetrwać ewentualną
  // nawigację (krok umiejętności potrafi przenieść na inną trasę PG, co czyściłoby
  // zwykłą zmienną JS, zanim dotrze do budowania wklejki), więc trzymane w GM
  // storage, nie w pamięci. Czyszczone zaraz po zbudowaniu ostatecznej wklejki.
  const HASLO_PG_EDYCJA_KEY = "wkf_haslo_pg_edycja";
  // Też trwałe (nie zwykła zmienna JS) — z tego samego powodu co powyżej (musi
  // przetrwać nawigację przy kroku umiejętności). Ustawiane na starcie edycji,
  // czyszczone na starcie tworzenia nowego konta i po zbudowaniu ostatecznej wklejki.
  const TRYB_EDYCJI_PG_KEY = "wkf_tryb_edycji_pg";

  function wklejka(role) {
    const lg = login();
    const lines = [
      `${ladnaForma(state.imie)} - ${state.klub} - ${role.label}`,
      `Email: ${loginBazowy()}@${CONFIG.DOMENA}`,
    ];
    // Przy EDYCJI istniejącego konta skrzynka zwykle już istnieje od dawna —
    // hasło do niej dopisujemy TYLKO, jeśli to MY ją niedawno założyliśmy
    // (pamięć ostatnich 3 skrzynek). Przy zwykłym tworzeniu nowego konta —
    // zawsze, jak dotychczas.
    const wTrybieEdycji = gmOdczytaj(TRYB_EDYCJI_PG_KEY) === "1";
    if (role.haslo && (!wTrybieEdycji || czyNiedawnoZalozonaSkrzynka(lg))) {
      lines.push(`Hasło do Home: ${state.haslo}`);
    }
    if (role.login) lines.push(`Login do PG: ${lg}`);
    const hasloPGEdycja = gmOdczytaj(HASLO_PG_EDYCJA_KEY);
    if (hasloPGEdycja) lines.push(`Hasło do PG: ${hasloPGEdycja}`);
    lines.push(...role.extra);
    lines.push(`Numer ID konta pracowniczego PG: ${state.id}`);
    lines.push(sygnatura());
    return lines.join("\n");
  }
  function wklejkaOdebranie() {
    return [
      `${ladnaForma(state.imie)} - ${state.klub}`,
      `Odebrano dostępy do PG`,
      `Zablokowano skrzynkę pocztową: ${login()}@${CONFIG.DOMENA}`,
      sygnatura(),
    ].join("\n");
  }

  // ---------- sprawdzanie skrzynki na home.pl ----------
  function czekaj(ms) { return new Promise(r => setTimeout(r, ms)); }

  function widoczny(elm) {
    return !!(elm && elm.offsetParent !== null);
  }

  function wszystkieDokumenty() {
    // dokument główny + wszystkie dostępne ramki (także zagnieżdżone)
    const docs = [document];
    const zbierz = (doc) => {
      for (const fr of doc.querySelectorAll("iframe, frame")) {
        try {
          const d = fr.contentDocument;
          if (d && !docs.includes(d)) { docs.push(d); zbierz(d); }
        } catch (e) { /* ramka z innej domeny — pomijamy */ }
      }
    };
    zbierz(document);
    return docs;
  }

  // Jak wyżej, ale zaczyna szukanie od NAJWYŻSZEGO okna (window.top), nie od bieżącego
  // dokumentu — potrzebne, gdy nasz skrypt sam działa wewnątrz zagnieżdżonej ramki
  // (bo tam bywa treść wniosku), a szukany element (np. pole komentarza) jest gdzieś
  // indziej na stronie, poza tą ramką — czyli "w górę", nie "w dół".
  function wszystkieDokumentyOdGory() {
    let gorny;
    try { gorny = window.top.document; } catch (e) { gorny = document; }
    const docs = [gorny];
    const zbierz = (doc) => {
      for (const fr of doc.querySelectorAll("iframe, frame")) {
        try {
          const d = fr.contentDocument;
          if (d && !docs.includes(d)) { docs.push(d); zbierz(d); }
        } catch (e) { /* ramka z innej domeny — pomijamy */ }
      }
    };
    try { zbierz(gorny); } catch (e) {}
    return docs;
  }

  // Liczy JUŻ ISTNIEJĄCE komentarze pod wnioskiem (nie licząc samego pola do
  // dodawania nowego — to osobny element, "jsCommentAdd", nie "jsCommentView")
  function policzKomentarzeNaWniosku() {
    let licznik = 0;
    for (const doc of wszystkieDokumentyOdGory()) {
      licznik += doc.querySelectorAll("li.jsCommentView").length;
    }
    return licznik;
  }

  function znajdzWszedzie(selektor) {
    for (const doc of wszystkieDokumenty()) {
      const e = doc.querySelector(selektor);
      if (e && widoczny(e)) return e;
    }
    return null;
  }

  function znajdzSzukaj() {
    for (const doc of wszystkieDokumenty()) {
      const kandydaci = [...doc.querySelectorAll("span, button, a")];
      const e = kandydaci.find(x => x.textContent.trim() === "Szukaj" && widoczny(x));
      if (e) return e;
    }
    return null;
  }

  function tekstWszedzie() {
    // Treść wszystkich ramek, ale BEZ naszego panelu i przycisku —
    // inaczej skrypt "znajdowałby" e-mail we własnych wklejkach
    return wszystkieDokumenty().map(d => {
      if (!d.body) return "";
      return [...d.body.children]
        .filter(ch => ch.id !== "wkf-panel" && ch.id !== "wkf-fab")
        .map(ch => ch.innerText || "")
        .join("\n");
    }).join("\n");
  }

  function ustawWartoscDojo(input, wartosc) {
    // Dojo potrafi ignorować zwykłe input.value — natywny setter + eventy
    const proto = input.ownerDocument.defaultView.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value").set;
    setter.call(input, wartosc);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
  }

  // Wpisuje tekst tak, jakby był naprawdę wpisany przez użytkownika — najpierw
  // przez execCommand("insertText"), które generuje PRAWDZIWE zdarzenie "input"
  // (z inputType "insertText"), rozpoznawane przez zwykłe (jQuery-owe) pola dużo
  // pewniej niż ręczne ustawienie .value + sztuczne zdarzenie. Zapasowo, gdyby się
  // nie udało, wraca do ustawWartoscDojo.
  function wpiszRealistycznie(input, wartosc) {
    try {
      input.focus();
      input.select();
      const ok = document.execCommand("insertText", false, wartosc);
      if (ok && input.value === wartosc) return true;
    } catch (e) {}
    ustawWartoscDojo(input, wartosc);
    return input.value === wartosc;
  }

  async function sprawdzSkrzynke(statusEl) {
    const lg = login();
    if (!lg) { statusEl.textContent = "Brak loginu — uzupełnij imię i nazwisko."; return "brak_loginu"; }
    const email = `${lg}@${CONFIG.DOMENA}`;
    statusEl.textContent = "Sprawdzam " + email + " ...";
    statusEl.style.color = "#6b7280";

    // 1) pole wyszukiwania — jeśli go nie ma, klikamy "Pokaż wyszukiwarkę" (strona Dojo
    //    bywa wolna, więc sprawdzamy i klikamy toggle W PĘTLI, nie tylko raz na starcie)
    //    i czekamy AŻ SIĘ POJAWI (adaptacyjnie, do ok. 60 s)
    let input = znajdzWszedzie("#mailboxes_mailboxesGrid-search-text-fullName");
    if (!input) {
      let toggleKlikniety = false;
      for (let i = 0; i < 80 && !input; i++) {
        if (!toggleKlikniety) {
          const toggle = znajdzWszedzie('[data-dojo-attach-point="_toggleFilterBtn"]');
          if (toggle) { toggle.click(); toggleKlikniety = true; }
        }
        await czekaj(400);
        input = znajdzWszedzie("#mailboxes_mailboxesGrid-search-text-fullName");
      }
    }
    if (!input) {
      statusEl.textContent = "Nie znalazłem pola wyszukiwania — otwórz listę skrzynek i spróbuj ponownie.";
      statusEl.style.color = "#b3261e";
      return "blad";
    }

    // 2) wpisujemy login i czekamy, aż pole naprawdę przyjmie wartość
    ustawWartoscDojo(input, lg);
    for (let i = 0; i < 20 && input.value !== lg; i++) {
      await czekaj(200);
      ustawWartoscDojo(input, lg);
    }

    // migawka strony PRZED wyszukiwaniem — po niej poznamy, że wyniki się przeładowały
    const przed = tekstWszedzie();

    const szukajBtn = znajdzSzukaj();
    if (szukajBtn) {
      szukajBtn.click();
    } else {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }));
    }

    // 3) czekamy adaptacyjnie (do 45 s): e-mail = sukces od razu;
    //    zmiana treści strony = wyniki wczytane → czekamy jeszcze aż się ustabilizują
    statusEl.textContent = "Czekam na wyniki wyszukiwania...";
    let poprzedni = "";
    let stabilne = 0;
    let zmienioneOdStartu = false;
    for (let i = 0; i < 150; i++) {
      await czekaj(300);
      const teraz = tekstWszedzie();
      if (teraz.includes(email)) {
        statusEl.textContent = "✔ Skrzynka " + email + " ISTNIEJE";
        statusEl.style.color = "#0f6f5c";
        return "istnieje";
      }
      if (teraz !== przed) zmienioneOdStartu = true;
      stabilne = (teraz === poprzedni) ? stabilne + 1 : 0;
      poprzedni = teraz;
      // wyniki się przeładowały i strona ucichła na chwilę → mamy odpowiedź
      if (zmienioneOdStartu && stabilne >= 3) break;
    }
    if (zmienioneOdStartu) {
      statusEl.textContent = "✘ Skrzynki " + email + " nie znaleziono — można zakładać";
      statusEl.style.color = "#b3261e";
      return "brak";
    } else {
      statusEl.textContent = "⚠ Strona nie odpowiedziała na wyszukiwanie — spróbuj ponownie.";
      statusEl.style.color = "#b3261e";
      return "blad";
    }
  }

  async function czekajNaElement(selektor, maxMs) {
    const kroki = Math.ceil((maxMs || 20000) / 300);
    for (let i = 0; i < kroki; i++) {
      const e = znajdzWszedzie(selektor);
      if (e) return e;
      await czekaj(300);
    }
    return null;
  }

  function znajdzSpanZTekstem(tekst) {
    for (const doc of wszystkieDokumenty()) {
      const e = [...doc.querySelectorAll("span")]
        .find(x => x.textContent.trim() === tekst && widoczny(x));
      if (e) return e;
    }
    return null;
  }

  // Łączy sprawdzenie i założenie w jedno: jeśli skrzynka już istnieje — zatrzymuje
  // się z komunikatem; jeśli nie istnieje — od razu ją zakłada.
  // Zwraca: "istnieje" (skrzynka już jest — UWAGA, możliwe że osoba ma już konto),
  // "zalozona" (nowa skrzynka poprawnie założona) albo "blad" (nie udało się).
  async function sprawdzIZalozSkrzynke(statusEl) {
    const wynik = await sprawdzSkrzynke(statusEl);
    if (wynik === "istnieje") {
      statusEl.textContent = "⚠ Skrzynka JUŻ ISTNIEJE — sprawdź, czy ta osoba nie ma już u nas konta!";
      statusEl.style.color = "#b3261e";
      return "istnieje";
    }
    if (wynik === "brak") {
      const ok = await zalozSkrzynke(statusEl);
      return ok ? "zalozona" : "blad";
    }
    // "blad" / "brak_loginu" — sprawdzSkrzynke już ustawiło odpowiedni komunikat
    return "blad";
  }

  async function zalozSkrzynke(statusEl) {
    const lg = login();
    if (!lg) { statusEl.textContent = "Brak loginu — uzupełnij imię i nazwisko."; return false; }
    statusEl.style.color = "#6b7280";

    // 1) Kreator: klikamy "Dodaj"
    statusEl.textContent = "Otwieram kreator (Dodaj)...";
    const dodaj = znajdzWszedzie("#mailboxes_addNew");
    if (!dodaj) { statusEl.textContent = "Nie znalazłem przycisku Dodaj — jesteś na liście skrzynek?"; statusEl.style.color = "#b3261e"; return false; }
    dodaj.click();

    // 2) Checkbox przy polu "Domena"
    statusEl.textContent = "Czekam na formularz...";
    let domenaSpan = null;
    for (let i = 0; i < 100 && !domenaSpan; i++) {
      await czekaj(300);
      domenaSpan = znajdzSpanZTekstem("Domena");
    }
    if (!domenaSpan) { statusEl.textContent = "Formularz się nie otworzył (brak pola Domena)."; statusEl.style.color = "#b3261e"; return false; }
    // szukamy checkboxa w tym samym wierszu formularza; awaryjnie klikamy sam napis
    let cb = null, w = domenaSpan;
    for (let i = 0; i < 6 && w && !cb; i++) {
      cb = w.querySelector ? w.querySelector('input[type="checkbox"]') : null;
      w = w.parentElement;
    }
    (cb || domenaSpan).click();

    // 3) Lista domen → wybieramy z CONFIG
    statusEl.textContent = "Wybieram domenę...";
    const sel = await czekajNaElement("#mailbox-new-advanced_availableDomains", 30000);
    if (!sel) { statusEl.textContent = "Nie pojawiła się lista domen."; statusEl.style.color = "#b3261e"; return false; }
    sel.value = CONFIG.DOMENA;
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    sel.dispatchEvent(new Event("input", { bubbles: true }));

    // 4) Pole nazwy skrzynki — ładuje się z opóźnieniem
    statusEl.textContent = "Czekam na pole nazwy...";
    const nazwa = await czekajNaElement("#mailbox-new-advanced_mailboxName", 35000);
    if (!nazwa) { statusEl.textContent = "Nie pojawiło się pole nazwy skrzynki."; statusEl.style.color = "#b3261e"; return false; }
    ustawWartoscDojo(nazwa, lg);
    for (let i = 0; i < 20 && nazwa.value !== lg; i++) { await czekaj(200); ustawWartoscDojo(nazwa, lg); }

    // 5) Hasło: bierzemy z panelu, a gdy puste — generujemy i zapisujemy do formatek
    if (!state.haslo) {
      state.haslo = generujHaslo();
      if (refs && refs.hasInput) refs.hasInput.value = state.haslo;
      zapiszStan();
      renderCards();
    }
    const pass = await czekajNaElement("#mailbox-new-advanced_mailboxPassword_textbox", 22000);
    if (!pass) { statusEl.textContent = "Nie znalazłem pola hasła."; statusEl.style.color = "#b3261e"; return false; }
    ustawWartoscDojo(pass, state.haslo);
    for (let i = 0; i < 20 && pass.value !== state.haslo; i++) { await czekaj(200); ustawWartoscDojo(pass, state.haslo); }

    // 6) Zapis — celujemy prosto w przycisk #submitNav (stałe id z formularza home.pl).
    //    Nieaktywny ma: disabled + klasy apsButtonDisabled/dijitDisabled — czekamy aż znikną
    statusEl.textContent = "Czekam, aż przycisk Zapisz będzie aktywny...";

    const przyciskZapisz = () => znajdzWszedzie("#submitNav");
    const aktywny = (b) => {
      if (!b) return false;
      if (b.disabled) return false;
      if (b.getAttribute && b.getAttribute("aria-disabled") === "true") return false;
      if (/(^|\s)(apsButtonDisabled|dijitDisabled|dijitButtonDisabled|disabled)(\s|$)/.test(b.className || "")) return false;
      return true;
    };
    const klikDojo = (b) => {
      // Pojedyncze, natywne .click() — najbardziej uniwersalne między przeglądarkami.
      // Ręcznie złożony zestaw zdarzeń (mousedown+mouseup+click) bywał niewystarczający
      // w Edge, a łączenie go z dodatkowym .click() (jak wcześniej) odpalało submit
      // dwa razy za jedno logiczne kliknięcie i zawieszało formularz.
      try { b.click(); } catch (e) {}
    };

    let zapisz = null;
    for (let i = 0; i < 180; i++) { // do ~54 s
      zapisz = przyciskZapisz();
      if (aktywny(zapisz)) break;
      await czekaj(300);
    }
    if (!zapisz) { statusEl.textContent = "Nie znalazłem przycisku Zapisz (#submitNav) — dokończ ręcznie."; statusEl.style.color = "#b3261e"; return false; }
    if (!aktywny(zapisz)) { statusEl.textContent = "Przycisk Zapisz nie odblokował się — sprawdź formularz i zapisz ręcznie."; statusEl.style.color = "#b3261e"; return false; }

    statusEl.textContent = "Zapisuję skrzynkę...";
    const urlPrzedZapisem = location.href;
    klikDojo(zapisz);

    const email = `${lg}@${CONFIG.DOMENA}`;
    const wrocilNaListe = () =>
      location.href !== urlPrzedZapisem && location.href.startsWith(HOME_URL);
    let ponowien = 0;
    for (let i = 0; i < 150; i++) {
      await czekaj(400);
      // Pewny sygnał sukcesu: po udanym zapisie strona wraca na listę skrzynek
      if (wrocilNaListe()) {
        zapamietajZalozonaSkrzynke(lg);
        statusEl.textContent = "✔ Skrzynka " + email + " ZAŁOŻONA (hasło w formatce)";
        statusEl.style.color = "#0f6f5c";
        return true;
      }
      if (tekstWszedzie().includes(email)) {
        zapamietajZalozonaSkrzynke(lg);
        statusEl.textContent = "✔ Skrzynka " + email + " ZAŁOŻONA (hasło w formatce)";
        statusEl.style.color = "#0f6f5c";
        return true;
      }
      // formularz wciąż otwarty z aktywnym Zapisz po dłuższej chwili? Home bywa wolne,
      // więc dajemy dużo więcej czasu (~12s) zanim uznamy, że trzeba spróbować ponownie —
      // zbyt częste ponawianie to właśnie to, co wcześniej zawieszało formularz
      if (i > 0 && i % 30 === 0 && ponowien < 3) {
        const z = przyciskZapisz();
        if (aktywny(z)) { klikDojo(z); ponowien++; statusEl.textContent = "Zapisuję skrzynkę... (ponawiam klik " + ponowien + ")"; }
      }
    }
    statusEl.textContent = "⚠ Kliknięto Zapisz — zweryfikuj na liście, czy skrzynka " + email + " powstała.";
    statusEl.style.color = "#b3261e";
    return false;
  }


  // ---------- Perfect Gym: automatyczne wypełnianie formularza pracownika ----------
  // Mapowanie typu konta na wybory w PG (dopasowanie tolerancyjne, bez polskich znaków)
  const ROLE_PG = {
    "Trener":            { rola: "trener floor",      stanowisko: "trener floor" },
    "Trener+Recepcja":   { rola: "obsluga klienta",   stanowisko: "trener floor" },
    "Trener personalny": { rola: "trener personalny", stanowisko: "trener personalny" },
    "Recepcja":          { rola: "obsluga klienta",   stanowisko: "recepcja" },
    "IZG":               { rola: "zajec grupowych",   stanowisko: "zajec grupowych" },
    "Instruktor Fitness":{ rola: "zajec grupowych",   stanowisko: "zajec grupowych" },
    "Master Trener":                     { rola: "master trener",              stanowisko: "master trener" },
    "Menadżer Klubu":                    { rola: "menadzer klubu",             stanowisko: "menadzer klubu" },
    "Menadżer Regionalny":               { rola: "menadzer regionalny",        stanowisko: "menadzer regionalny" },
    "Zastępca Menadżera Klubu (ZMK)":    { rola: "zastepca menadzera klubu",   stanowisko: "zastepca menadzera klubu" },
    "Menadżer Fitness":                  { rola: "menadzer zajec grupowych",   stanowisko: "menadzer zajec grupowych" },
    "DOK":                               { rola: "dok",                        stanowisko: "dok" },
    "Księgowi":                          { rola: "ksiegowosc",                 stanowisko: "ksiegowosc" },
    "Fizjoterapeuta":                    { rola: "zajec grupowych",            stanowisko: "zajec grupowych" },
  };

  function norm(s) { return bezPolskich((s || "").toLowerCase()).replace(/\s+/g, " ").trim(); }

  // Zgaduje płeć po imieniu — w polskim niemal wszystkie imiona żeńskie kończą się
  // na "a" (Anna, Katarzyna...), męskie w większości nie. Kilka męskich wyjątków
  // kończących się na "a" jest tu wykluczonych ręcznie.
  const MESKIE_WYJATKI_NA_A = [
    // polskie
    "kuba", "barnaba", "bonawentura", "kosma",
    // ukraińskie (transliterowane) — te imiona są męskie mimo końcówki "a"
    "mykola", "illia", "illya", "ilya", "sava", "yarema", "foma",
  ];
  function zgadnijPlec(imie) {
    const n = norm(imie).split(/\s+/)[0] || ""; // tylko pierwsze imię
    if (!n) return null;
    if (MESKIE_WYJATKI_NA_A.includes(n)) return "mezczyzna";
    return n.endsWith("a") ? "kobieta" : "mezczyzna";
  }

  function znajdzPoSufiksie(suf) {
    for (const doc of wszystkieDokumenty()) {
      const e = [...doc.querySelectorAll("[id]")].find(x => x.id.endsWith(suf) && widoczny(x));
      if (e) return e;
    }
    return null;
  }
  async function czekajNaSufiks(suf, maxMs) {
    const kroki = Math.ceil((maxMs || 30000) / 300);
    for (let i = 0; i < kroki; i++) {
      const e = znajdzPoSufiksie(suf);
      if (e) return e;
      await czekaj(300);
    }
    return null;
  }

  function klikMysza(b) {
    // UWAGA: na checkboxie/radio KAŻDE zdarzenie click przełącza/ustawia stan,
    // więc wysyłamy dokładnie JEDNO — inaczej zaznaczenie od razu się cofa
    if (b.tagName === "INPUT" && (b.type === "checkbox" || b.type === "radio")) { b.click(); return; }
    const win = b.ownerDocument.defaultView;
    const opts = { bubbles: true, cancelable: true, view: win };
    b.dispatchEvent(new MouseEvent("mousedown", opts));
    b.dispatchEvent(new MouseEvent("mouseup", opts));
    b.dispatchEvent(new MouseEvent("click", opts));
    // BEZ dodatkowego natywnego .click() na końcu — powodowało PODWÓJNE odpalenie
    // handlera onclick (raz z syntetycznego "click" powyżej, raz z .click()), co dla
    // przycisków robiących postback (Dodaj nowego pracownika, Zapisz, Szukaj...)
    // oznaczało dwa żądania do serwera zamiast jednego — stąd zauważalnie dłuższe
    // oczekiwanie niż przy zwykłym, pojedynczym kliknięciu ręcznym.
  }

  // Pojedyncze, NIEDUBLOWANE kliknięcie — klikMysza() wysyła ręczne zdarzenie "click"
  // ORAZ natywne .click(), co odpala handler dwa razy za jedno logiczne kliknięcie.
  // Dla akcji, które faktycznie coś otwierają/wysyłają na serwer (menu, pozycje w
  // module Umiejętności), podwójne odpalenie potrafi zawiesić appkę — tu klikamy raz.
  function klikPojedynczo(el) {
    try { el.click(); return; } catch (e) {}
    try {
      const win = el.ownerDocument.defaultView;
      el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: win }));
    } catch (e) {}
  }

  // Pełna sekwencja mousedown→mouseup→click, ale KAŻDE zdarzenie dokładnie RAZ
  // (bez dodatkowego .click() na końcu) — niektóre customowe komponenty (np. ten
  // combobox umiejętności) otwierają się na mousedown, nie na click, więc samo
  // klikPojedynczo() (tylko "click") ich nie wyzwala.
  function klikRealistycznie(el) {
    try {
      const win = el.ownerDocument.defaultView;
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const opts = { bubbles: true, cancelable: true, view: win, clientX: cx, clientY: cy, button: 0 };
      const PE = win.PointerEvent || win.MouseEvent;
      el.dispatchEvent(new PE("pointerdown", opts));
      el.dispatchEvent(new MouseEvent("mousedown", opts));
      el.dispatchEvent(new PE("pointerup", opts));
      el.dispatchEvent(new MouseEvent("mouseup", opts));
      el.dispatchEvent(new MouseEvent("click", opts));
    } catch (e) {}
  }

  function ustawRadInput(input, wartosc) {
    // Telerik RadInput: wartość + eventy + ClientState (inaczej walidacja widzi puste pole)
    ustawWartoscDojo(input, wartosc);
    try { input.dispatchEvent(new Event("focus", { bubbles: true })); } catch (e) {}
    try { input.dispatchEvent(new Event("blur", { bubbles: true })); } catch (e) {}
    const cs = input.ownerDocument.getElementById(input.id + "_ClientState");
    if (cs) cs.value = JSON.stringify({
      enabled: true, emptyMessage: "[Pole obowiązkowe]",
      validationText: wartosc, valueAsString: wartosc, lastSetTextBoxValue: wartosc
    });
    input.classList.remove("riEmpty");
  }

  function znajdzElementPoId(suf) {
    // element po końcówce id — BEZ wymogu widoczności (listy Telerik bywają "schowane" w CSS)
    for (const doc of wszystkieDokumenty()) {
      const e = [...doc.querySelectorAll("[id]")].find(x => x.id.endsWith(suf));
      if (e) return e;
    }
    return null;
  }

  async function otworzCombo(baza) {
    // klikamy input, a gdy trzeba — strzałkę rozwijania
    const input = znajdzElementPoId(baza + "_Input");
    if (!input) return null;
    klikMysza(input);
    await czekaj(280);
    let dd = znajdzElementPoId(baza + "_DropDown");
    if (!dd || !widoczny(dd)) {
      const arrow = znajdzElementPoId(baza + "_Arrow");
      if (arrow) { klikMysza(arrow); await czekaj(280); }
      dd = znajdzElementPoId(baza + "_DropDown");
    }
    return dd; // może być "niewidoczny" wg CSS — Telerik i tak obsłuży kliknięcia w środku
  }

  // ===== NOWE: zamykanie otwartych list Telerik (RadComboBox) =====
  // Wcześniej ta funkcja była WYWOŁYWANA w trzech miejscach, ale nigdzie
  // niezdefiniowana — przez "use strict" powodowało to ReferenceError,
  // który po cichu ubijał Promise wewnątrz async function i proces
  // zawieszał się (najczęściej tuż po zaznaczeniu klubów albo działu BENEFIT).
  function zamknijListy() {
    // Strzałka "Escape" + blur na aktywnym elemencie, we wszystkich ramkach —
    // RadComboBox chowa dropdown po utracie fokusu / Escape.
    for (const doc of wszystkieDokumenty()) {
      const akt = doc.activeElement;
      if (akt && akt !== doc.body) {
        try {
          akt.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }));
        } catch (e) {}
        try { akt.blur(); } catch (e) {}
      }
    }
    // Dodatkowo klikamy w neutralne miejsce dokumentu głównego —
    // niektóre wersje Telerik zamykają dropdown dopiero po kliknięciu "na zewnątrz"
    try {
      document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, view: window }));
    } catch (e) {}
  }

  async function zaznaczWszystkoWCombo(baza) {
    for (let proba = 0; proba < 3; proba++) {
      const dd = await otworzCombo(baza);
      if (!dd) { await czekaj(400); continue; }
      for (let i = 0; i < 12; i++) {
        const cb = dd.querySelector("input.rcbCheckAllItemsCheckBox");
        if (cb) {
          if (cb.checked) { zamknijListy(); return true; } // już zaznaczone
          klikMysza(cb);
          await czekaj(350);
          if (cb.checked) { zamknijListy(); return true; }
          klikMysza(cb);
          await czekaj(350);
          if (cb.checked) { zamknijListy(); return true; }
        }
        await czekaj(250);
      }
    }
    return false;
  }

  async function wybierzZCombo(baza, klucz) {
    const k = norm(klucz);
    for (let proba = 0; proba < 3; proba++) {
      const dd = await otworzCombo(baza);
      if (!dd) { await czekaj(400); continue; }
      for (let i = 0; i < 20; i++) {
        const items = [...dd.querySelectorAll("li.rcbItem, li, label")];
        const it = items.find(x => norm(x.textContent).includes(k));
        if (it) {
          const cb = it.querySelector ? it.querySelector('input[type="checkbox"]') : null;
          klikMysza(cb || it);
          await czekaj(350);
          return true;
        }
        await czekaj(250);
      }
    }
    return false;
  }

  // Zaznaczanie checkboxa w liście wielokrotnego wyboru (np. Dział) po dopasowaniu tekstu.
  // W odróżnieniu od wybierzZCombo: WERYFIKUJE, że checkbox faktycznie się zaznaczył
  // (poprzedni kod klikał i zakładał sukces bez sprawdzenia — stąd "nie zaznacza się").
  // Próbuje na przemian kliknąć sam checkbox i cały wiersz listy (li), bo w Telerik
  // RadComboBox obsługa kliknięcia bywa spięta z całym elementem, nie samym inputem.
  async function zaznaczCheckboxWListPoTekscie(baza, klucz) {
    const k = norm(klucz);
    const dd = await otworzCombo(baza);
    if (!dd) return false;
    // szukamy pozycji na liście — krótko, ok. 1s, żeby szybko przejść do zapasowej opcji
    let it = null;
    for (let i = 0; i < 4 && !it; i++) {
      const items = [...dd.querySelectorAll("li.rcbItem, li")];
      it = items.find(x => norm(x.textContent).includes(k));
      if (!it) await czekaj(250);
    }
    if (!it) return false;
    const cb = it.querySelector('input.rcbCheckBox') || it.querySelector('input[type="checkbox"]');
    if (!cb) return false;
    for (let p = 0; p < 3 && !cb.checked; p++) {
      if (p % 2 === 0) klikMysza(cb); else klikMysza(it);
      await czekaj(300);
    }
    return cb.checked;
  }

  async function wypelnijFormularzPG(statusEl, typ) {
    const map = ROLE_PG[typ];
    if (!map) { statusEl.textContent = "Nieznany typ konta: " + typ; statusEl.style.color = "#b3261e"; return; }
    const czesci = ladnaForma(state.imie).split(/\s+/).filter(Boolean);
    const imie = czesci[0] || "", nazwisko = czesci.slice(1).join(" ");
    const lg = login();
    const email = lg ? lg + "@" + CONFIG.DOMENA : "";
    if (!imie || !nazwisko || !lg) { statusEl.textContent = "Uzupełnij najpierw imię i nazwisko."; statusEl.style.color = "#b3261e"; return; }
    statusEl.style.color = "#6b7280";
    gmZapisz(TRYB_EDYCJI_PG_KEY, ""); // to tworzenie, nie edycja — hasło do Home ma się pokazać normalnie
    const stop = (msg) => { statusEl.textContent = "✋ " + msg + " — dokończ ręcznie, konta NIE dodano."; statusEl.style.color = "#b3261e"; };

    // 0) Sprawdzamy NAJPIERW, czy taka osoba już nie ma konta w PG (po nazwisku,
    //    z weryfikacją loginu — dwie osoby o tym samym imieniu i nazwisku, ale innym
    //    loginie/sufiksie, to różne konta). Dla typów bez loginu (IZG/Fizjoterapeuta)
    //    weryfikujemy tylko po imieniu i nazwisku.
    const wynikSprawdzenia = await sprawdzCzyIstniejeWPG(statusEl, imie, nazwisko, wymagaLoginu(typ) ? lg : null);
    if (wynikSprawdzenia === "istnieje") return; // komunikat już ustawiony, zatrzymujemy się

    // 1) "Dodaj nowego pracownika" — czekamy (do 20s), bo po automatycznym
    //    przekierowaniu na inną instancję strona (Angular) potrzebuje chwili na załadowanie
    statusEl.textContent = "Otwieram edytor pracownika...";
    let addBtn = null;
    for (let i = 0; i < 50 && !addBtn; i++) {
      for (const doc of wszystkieDokumenty()) {
        addBtn = [...doc.querySelectorAll('input[type="button"]')]
          .find(b => (b.value || "").trim() === "Dodaj nowego pracownika" && widoczny(b));
        if (addBtn) break;
      }
      if (!addBtn) await czekaj(400);
    }
    if (!addBtn) return stop("Nie znalazłem przycisku 'Dodaj nowego pracownika'");
    klikMysza(addBtn);

    // 2) imię i nazwisko
    statusEl.textContent = "Czekam na edytor...";
    const tName = await czekajNaSufiks("_EditFormControl_tboxName", 40000);
    if (!tName) return stop("Edytor się nie otworzył (brak pola imienia)");
    const tLast = znajdzPoSufiksie("_EditFormControl_tboxLastName");
    if (!tLast) return stop("Brak pola nazwiska");
    statusEl.textContent = "Wpisuję imię i nazwisko...";
    ustawRadInput(tName, imie);
    ustawRadInput(tLast, nazwisko);

    // 2b) płeć — zgadywana po imieniu (radio Mężczyzna/Kobieta)
    const plec = zgadnijPlec(imie);
    const sufiksPlci = plec === "kobieta" ? "_EditFormControl_rbFemale" : "_EditFormControl_rbMale";
    const rbPlec = znajdzPoSufiksie(sufiksPlci);
    if (!rbPlec) return stop("Nie znalazłem pola płci (" + (plec === "kobieta" ? "Kobieta" : "Mężczyzna") + ")");
    if (!rbPlec.checked) klikMysza(rbPlec);

    // 3) checkbox "nigdy nie dezaktywuj"
    const chkNever = znajdzPoSufiksie("_EditFormControl_chkIsNeverAutomatillyDeactivated");
    if (!chkNever) return stop("Brak checkboxa dezaktywacji");
    if (!chkNever.checked) chkNever.click();

    // 4) pierwsza lista: "Zaznacz wszystko" (combo tuż przed checkboxem AddToNewClub)
    const chkNewClub = znajdzPoSufiksie("_EditFormControl_chkAddToNewClub");
    if (!chkNewClub) return stop("Brak checkboxa 'dodaj do nowych klubów'");
    statusEl.textContent = "Lista klubów: zaznaczam wszystko...";
    if (!(await zaznaczWszystkoWCombo("_EditFormControl_cboxClubs"))) return stop("Lista klubów: nie udało się zaznaczyć wszystkiego");

    // 5) checkbox AddToNewClub
    if (!chkNewClub.checked) chkNewClub.click();
    await czekaj(400);

    // 6) druga lista (dostępny w klubach): "Zaznacz wszystko"
    statusEl.textContent = "Druga lista: zaznaczam wszystko...";
    if (!(await zaznaczWszystkoWCombo("_EditFormControl_cboxAvailableInClubs"))) return stop("Lista 'dostępny w klubach': nie udało się zaznaczyć wszystkiego");

    // 7) checkbox dostępności w nowych klubach
    const chkAvail = znajdzPoSufiksie("_EditFormControl_chkAddEmployeeAvailabilityInNewClubs");
    if (!chkAvail) return stop("Brak checkboxa dostępności w nowych klubach");
    if (!chkAvail.checked) chkAvail.click();

    // 8) e-mail
    statusEl.textContent = "Wpisuję e-mail...";
    const tEmail = znajdzPoSufiksie("_EditFormControl_tboxEmail");
    if (!tEmail) return stop("Brak pola e-mail");
    ustawRadInput(tEmail, email);

    // 9) rola systemowa i stanowisko wg typu konta
    statusEl.textContent = "Wybieram rolę: " + typ + "...";
    if (!(await wybierzZCombo("_EditFormControl_cboxRoles", map.rola))) return stop("Nie znalazłem roli '" + map.rola + "' na liście");
    if (!(await wybierzZCombo("_EditFormControl_cboxEmployeePosition", map.stanowisko))) return stop("Nie znalazłem stanowiska '" + map.stanowisko + "'");

    // 10) dział: BENEFIT, a jeśli go nie ma na liście (inny klub) — zapasowo Crm Consultants
    statusEl.textContent = "Dział: BENEFIT...";
    let zaznaczonoDzial = await zaznaczCheckboxWListPoTekscie("_EditFormControl_cboxDepartments", "benefit");
    if (!zaznaczonoDzial) {
      statusEl.textContent = "BENEFIT niedostępny — próbuję Crm Consultants...";
      zaznaczonoDzial = await zaznaczCheckboxWListPoTekscie("_EditFormControl_cboxDepartments", "crm consultants");
    }
    if (!zaznaczonoDzial) return stop("Nie udało się zaznaczyć działu (ani BENEFIT, ani Crm Consultants)");
    zamknijListy();

    // 11) login / bez logowania
    if (!wymagaLoginu(typ)) {
      statusEl.textContent = typ + ": zaznaczam 'bez logowania'...";
      const chkNoLogin = znajdzPoSufiksie("_EditFormControl_chkNoLogin");
      if (!chkNoLogin) return stop("Brak checkboxa 'bez logowania'");
      if (!chkNoLogin.checked) chkNoLogin.click();
      await czekaj(2000); // checkbox robi postback — dajemy stronie odetchnąć
    } else {
      statusEl.textContent = "Wpisuję login...";
      const tLogin = await czekajNaSufiks("_EditFormControl_tboxLogin", 15000);
      if (!tLogin) return stop("Brak pola loginu");
      ustawRadInput(tLogin, lg);
    }

    // 12) Dodaj — klikamy tylko, gdy WSZYSTKIE kroki się udały
    statusEl.textContent = "Dodaję konto...";
    const btnInsert = znajdzPoSufiksie("_EditFormControl_btnInsert");
    if (!btnInsert) return stop("Brak przycisku Dodaj");
    klikMysza(btnInsert);

    let dodano = false;
    for (let i = 0; i < 75; i++) {
      await czekaj(400);
      if (!znajdzPoSufiksie("_EditFormControl_btnInsert")) { dodano = true; break; }
    }
    if (!dodano) {
      statusEl.textContent = "⚠ Kliknięto Dodaj — edytor wciąż otwarty, sprawdź walidację formularza.";
      statusEl.style.color = "#b3261e";
      return;
    }

    if (!wymagaLoginu(typ)) {
      // Brak loginu ("bez logowania") — szukamy po IMIENIU I NAZWISKU zamiast po loginie
      await wyszukajIZapiszId(statusEl, imie, nazwisko, typ, null);
      // Wyjątek: Fizjoterapeuta w Fitness Academy mimo braku loginu dostaje umiejętność
      // SW — szukamy go w module Umiejętności po IMIENIU I NAZWISKU (nie ma loginu)
      if (typ === "Fizjoterapeuta" && state.instNazwa === "FitnessAcademy") {
        statusEl.textContent += " — przechodzę do nadania umiejętności SW...";
        await czekaj(600);
        await rozpocznijUmiejetnosci(statusEl, imie + " " + nazwisko, ["Spotkanie wprowadzające (SW)"], "zajec grupowych");
        // (kopiowanie wklejki nastąpi na końcu rozpocznijUmiejetnosci)
      } else {
        zakonczProces(statusEl, typ);
      }
      return;
    }

    // 13) Szukamy nowo utworzone konto po loginie i kopiujemy ID z tabeli do formatki
    await wyszukajISkopiujId(statusEl, lg, imie, nazwisko, typ);
  }

  // Wyszukuje w gridzie pracowników wiersz po loginie i wyciąga z niego numer ID,
  // zapisując go do wspólnego stanu (żeby pojawił się w formatkach na emplo/home.pl)
  function znajdzWierszPoLoginie(lg) {
    const cel = lg.trim().toLowerCase();
    for (const doc of wszystkieDokumenty()) {
      const komorki = [...doc.querySelectorAll("td")];
      const komorka = komorki.find(td => td.textContent.trim().toLowerCase() === cel);
      if (komorka) {
        const tr = komorka.closest ? komorka.closest("tr") : null;
        if (tr) return tr;
      }
    }
    return null;
  }
  // Szuka wiersza po IMIENIU I NAZWISKU razem (nie po loginie — przydatne, gdy loginu
  // jeszcze nie ma, np. przed utworzeniem konta, albo dla typów bez loginu jak IZG)
  function znajdzWierszPoImieniuNazwisku(imie, nazwisko, oczekiwanyLogin) {
    const ci = norm(imie), cn = norm(nazwisko);
    const celLogin = (oczekiwanyLogin || "").trim().toLowerCase();
    let kandydaci = [];
    for (const doc of wszystkieDokumenty()) {
      const wiersze = [...doc.querySelectorAll("tr")].filter(tr => {
        const t = norm(tr.textContent);
        return t.includes(ci) && t.includes(cn);
      });
      kandydaci = kandydaci.concat(wiersze);
    }
    if (!kandydaci.length) return null;
    if (!celLogin) return kandydaci[0]; // brak loginu do porównania (np. IZG/Fizjoterapeuta) — jak dotychczas

    // Wśród osób o tym samym imieniu i nazwisku szukamy TEJ z dokładnie takim samym
    // loginem (uwzględnia sufiks, np. "2") — inny (niepusty) login = inna osoba/inne
    // konto, mimo identycznego imienia i nazwiska.
    const zTymSamymLoginem = kandydaci.find(tr =>
      [...tr.querySelectorAll("td")].some(td => td.textContent.trim().toLowerCase() === celLogin)
    );
    if (zTymSamymLoginem) return zTymSamymLoginem;

    // Kandydat, który w ogóle NIE MA loginu (kolumna Login pokazuje "-", typowe dla
    // IZG/Fizjoterapeuty) jest niejednoznaczny — to może być TA SAMA osoba, tylko
    // wcześniej założona jako typ bez loginu. Brak loginu to nie to samo, co INNY
    // login — bezpieczniej zgłosić to jako możliwe dopasowanie niż po cichu pozwolić
    // założyć duplikat konta.
    const bezLoginu = kandydaci.find(tr =>
      [...tr.querySelectorAll("td")].some(td => td.textContent.trim() === "-")
    );
    return bezLoginu || null;
  }
  function wyciagnijIdZWiersza(tr) {
    // Kolumna ID to zawsze czysto liczbowa wartość — odporne na kolejność/liczbę kolumn
    const komorki = [...tr.querySelectorAll("td")];
    const idKomorka = komorki.find(td => /^\d{2,}$/.test(td.textContent.trim()));
    return idKomorka ? idKomorka.textContent.trim() : "";
  }

  // Sprawdza w gridzie pracowników PG, czy dana osoba (po imieniu+nazwisku) JUŻ
  // istnieje — szuka po NAZWISKU (login jeszcze nie istnieje, bo konta nie ma).
  // Zwraca: "istnieje" | "brak" | "blad".
  // Wspólne wyszukiwanie w PG po nazwisku, z weryfikacją imię+nazwisko.
  // Zwraca: undefined = błąd techniczny (nie znaleziono pola/przycisku wyszukiwania),
  //         null = wyszukano poprawnie, ale nikogo nie znaleziono,
  //         element <tr> = znaleziony wiersz pasującej osoby.
  async function wyszukajWierszWPG(statusEl, imie, nazwisko, oczekiwanyLogin, szukajTekst) {
    szukajTekst = szukajTekst || nazwisko;
    statusEl.textContent = "Szukam " + imie + " " + nazwisko + " w PG (" + szukajTekst + ")...";
    statusEl.style.color = "#6b7280";

    // NAJPIERW odznaczamy "Tylko aktywne" — to robi postback (przeładowanie
    // fragmentu strony), więc musi się to zdarzyć PRZED wpisaniem tekstu szukania,
    // inaczej postback kasował dopiero co wpisany tekst i wyszukiwanie zawsze
    // szukało pustego pola (stąd zawsze pełny, długi timeout bez wyniku).
    // Odstęp skrócony — kolejny krok (czekajNaSufiks poniżej) i tak poczeka
    // dłużej, jeśli faktycznie potrzeba, więc nie ma sensu tu na sztywno płacić
    // pełnej ceny za każdym razem.
    const chkAktywne = znajdzPoSufiksie("_chkActiveOnly");
    if (chkAktywne && chkAktywne.checked) {
      chkAktywne.click();
      await czekaj(500);
    }

    const pole = await czekajNaSufiks("_tboxSearchText", 20000);
    if (!pole) {
      statusEl.textContent = "✋ Nie znalazłem pola wyszukiwania w PG — sprawdź ręcznie.";
      statusEl.style.color = "#b3261e";
      return undefined;
    }
    ustawRadInput(pole, szukajTekst);
    await czekaj(300);

    const btnSzukaj = znajdzPoSufiksie("_btnSearch");
    if (!btnSzukaj) {
      statusEl.textContent = "✋ Nie znalazłem przycisku Szukaj w PG — sprawdź ręcznie.";
      statusEl.style.color = "#b3261e";
      return undefined;
    }
    klikMysza(btnSzukaj);

    // Tania operacja (zwykłe querySelectorAll, nie odczyt całej treści strony) —
    // można sprawdzać częściej bez obciążania karty
    let wiersz = null;
    for (let i = 0; i < 28 && !wiersz; i++) { // do ~8s
      await czekaj(280);
      wiersz = znajdzWierszPoImieniuNazwisku(imie, nazwisko, oczekiwanyLogin);
    }
    return wiersz;
  }

  async function sprawdzCzyIstniejeWPG(statusEl, imie, nazwisko, oczekiwanyLogin) {
    const wiersz = await wyszukajWierszWPG(statusEl, imie, nazwisko, oczekiwanyLogin);
    if (wiersz === undefined) return "blad"; // komunikat już ustawiony przez wyszukajWierszWPG
    if (wiersz) {
      const id = wyciagnijIdZWiersza(wiersz);
      statusEl.textContent = "⚠ " + imie + " " + nazwisko + (oczekiwanyLogin ? " (" + oczekiwanyLogin + ")" : "") + " JUŻ ISTNIEJE w PG" + (id ? " (ID: " + id + ")" : "") + " — nie zakładam kolejnego konta.";
      statusEl.style.color = "#b3261e";
      return "istnieje";
    }
    statusEl.textContent = "✔ Nie znaleziono " + imie + " " + nazwisko + (oczekiwanyLogin ? " (" + oczekiwanyLogin + ")" : "") + " w PG — można zakładać nowe konto.";
    statusEl.style.color = "#0f6f5c";
    return "brak";
  }

  // Edycja JUŻ ISTNIEJĄCEGO konta w PG — wyszukuje osobę, klika ikonkę edycji przy
  // jej wierszu, sprawdza/poprawia te same pola co przy tworzeniu (rola, stanowisko,
  // dział, płeć, kluby, login/bez logowania) wg AKTUALNIE wybranego typu, i zapisuje
  // przyciskiem "Zapisz" (btnUpdate — inny niż "Dodaj"/btnInsert przy tworzeniu).
  // Jeśli nowy typ wymaga umiejętności — dodaje je po zapisaniu, tak jak przy tworzeniu.
  async function edytujKontoPG(statusEl, typ) {
    const map = ROLE_PG[typ];
    if (!map) { statusEl.textContent = "Nieznany typ konta: " + typ; statusEl.style.color = "#b3261e"; return; }
    const czesci = ladnaForma(state.imie).split(/\s+/).filter(Boolean);
    const imie = czesci[0] || "", nazwisko = czesci.slice(1).join(" ");
    const lg = login();
    const email = lg ? lg + "@" + CONFIG.DOMENA : "";
    if (!imie || !nazwisko) { statusEl.textContent = "Uzupełnij najpierw imię i nazwisko."; statusEl.style.color = "#b3261e"; return; }
    statusEl.style.color = "#6b7280";
    gmZapisz(HASLO_PG_EDYCJA_KEY, ""); // reset — nie chcemy zostawionego hasła z poprzedniej edycji
    gmZapisz(TRYB_EDYCJI_PG_KEY, "1"); // to edycja — hasło do Home tylko jeśli MY niedawno założyliśmy tę skrzynkę
    const stop = (msg) => { statusEl.textContent = "✋ " + msg + " — dokończ ręcznie."; statusEl.style.color = "#b3261e"; };

    const wiersz = await wyszukajWierszWPG(statusEl, imie, nazwisko, wymagaLoginu(typ) ? lg : null);
    if (wiersz === undefined) return; // komunikat już ustawiony
    if (!wiersz) {
      statusEl.textContent = "✋ Nie znalazłem " + imie + " " + nazwisko + " w PG — nie ma czego edytować.";
      statusEl.style.color = "#b3261e";
      return;
    }

    statusEl.textContent = "Otwieram edycję pracownika...";
    const editBtn = wiersz.querySelector('[id$="_EditButton"], [name$="EditButton"]');
    if (!editBtn) return stop("Nie znalazłem przycisku edycji (ikonki ✏️) w wierszu");
    klikMysza(editBtn);

    // Reszta pól ma te same identyfikatory co przy tworzeniu (ten sam edytor)
    statusEl.textContent = "Czekam na edytor...";
    const tName = await czekajNaSufiks("_EditFormControl_tboxName", 40000);
    if (!tName) return stop("Edytor się nie otworzył (brak pola imienia)");
    const tLast = znajdzPoSufiksie("_EditFormControl_tboxLastName");
    if (!tLast) return stop("Brak pola nazwiska");
    statusEl.textContent = "Sprawdzam/poprawiam imię i nazwisko...";
    ustawRadInput(tName, imie);
    ustawRadInput(tLast, nazwisko);

    const plec = zgadnijPlec(imie);
    const sufiksPlci = plec === "kobieta" ? "_EditFormControl_rbFemale" : "_EditFormControl_rbMale";
    const rbPlec = znajdzPoSufiksie(sufiksPlci);
    if (rbPlec && !rbPlec.checked) klikMysza(rbPlec);

    const chkNever = znajdzPoSufiksie("_EditFormControl_chkIsNeverAutomatillyDeactivated");
    if (chkNever && !chkNever.checked) chkNever.click();

    const chkNewClub = znajdzPoSufiksie("_EditFormControl_chkAddToNewClub");
    if (chkNewClub) {
      statusEl.textContent = "Lista klubów: zaznaczam wszystko...";
      await zaznaczWszystkoWCombo("_EditFormControl_cboxClubs");
      if (!chkNewClub.checked) chkNewClub.click();
      await czekaj(400);
    }
    const chkAvail = znajdzPoSufiksie("_EditFormControl_chkAddEmployeeAvailabilityInNewClubs");
    if (chkAvail) {
      statusEl.textContent = "Druga lista: zaznaczam wszystko...";
      await zaznaczWszystkoWCombo("_EditFormControl_cboxAvailableInClubs");
      if (!chkAvail.checked) chkAvail.click();
    }

    const tEmail = znajdzPoSufiksie("_EditFormControl_tboxEmail");
    if (tEmail) ustawRadInput(tEmail, email);

    statusEl.textContent = "Ustawiam rolę: " + typ + "...";
    if (!(await wybierzZCombo("_EditFormControl_cboxRoles", map.rola))) return stop("Nie znalazłem roli '" + map.rola + "'");
    if (!(await wybierzZCombo("_EditFormControl_cboxEmployeePosition", map.stanowisko))) return stop("Nie znalazłem stanowiska '" + map.stanowisko + "'");

    statusEl.textContent = "Dział: BENEFIT...";
    let zaznaczonoDzial = await zaznaczCheckboxWListPoTekscie("_EditFormControl_cboxDepartments", "benefit");
    if (!zaznaczonoDzial) {
      statusEl.textContent = "BENEFIT niedostępny — próbuję Crm Consultants...";
      zaznaczonoDzial = await zaznaczCheckboxWListPoTekscie("_EditFormControl_cboxDepartments", "crm consultants");
    }
    zamknijListy();

    if (!wymagaLoginu(typ)) {
      statusEl.textContent = typ + ": zaznaczam 'bez logowania'...";
      const chkNoLogin = znajdzPoSufiksie("_EditFormControl_chkNoLogin");
      if (chkNoLogin && !chkNoLogin.checked) { chkNoLogin.click(); await czekaj(2000); }
    } else {
      // Odznaczamy "bez logowania", jeśli było zaznaczone (np. edytujemy konto,
      // które wcześniej było typu IZG/Fizjoterapeuta, na typ WYMAGAJĄCY loginu) —
      // inaczej pole loginu bywa ukryte i próba wpisania w nie nic nie zmienia.
      statusEl.textContent = "Sprawdzam pole loginu...";
      const chkNoLogin = znajdzPoSufiksie("_EditFormControl_chkNoLogin");
      const bylBezLoginu = !!(chkNoLogin && chkNoLogin.checked);
      if (bylBezLoginu) {
        statusEl.textContent = "Odznaczam 'bez logowania'...";
        chkNoLogin.click();
        await czekaj(2000); // odznaczenie robi postback — dajemy stronie odetchnąć
      }

      // Pole to Telerik RadInput — gdy puste, jego .value to DOSŁOWNIE tekst
      // placeholdera "[Pole obowiązkowe]" (nie prawdziwy pusty string!), więc
      // sprawdzanie "!tLogin.value" nigdy by go nie wykryło jako puste.
      const tLogin = await czekajNaSufiks("_EditFormControl_tboxLogin", 15000);
      if (tLogin) {
        statusEl.textContent = "Wpisuję login...";
        for (let i = 0; i < 20 && tLogin.value !== lg; i++) {
          ustawRadInput(tLogin, lg);
          await czekaj(250);
        }
        if (tLogin.value !== lg) {
          statusEl.textContent = "⚠ Nie udało się wpisać loginu automatycznie — wpisz ręcznie przed zapisem.";
          statusEl.style.color = "#b3261e";
        } else if (bylBezLoginu) {
          // Konto wcześniej nie miało loginu (ani hasła) — teraz trzeba nadać
          // nowe hasło do PG i dopisać je do wklejki (bo do tej pory go po prostu
          // nie było, więc nikt go nie zna).
          statusEl.textContent = "Nadaję nowe hasło do PG...";
          const tPassword = znajdzPoSufiksie("_EditFormControl_tboxPassword");
          if (tPassword) {
            const noweHaslo = generujHasloPG();
            for (let i = 0; i < 15 && tPassword.value !== noweHaslo; i++) {
              ustawRadInput(tPassword, noweHaslo);
              await czekaj(250);
            }
            if (tPassword.value !== noweHaslo) {
              statusEl.textContent = "⚠ Nie udało się wpisać hasła do PG automatycznie — ustaw ręcznie przed zapisem.";
              statusEl.style.color = "#b3261e";
              // nie dopisujemy do wklejki hasła, którego nie udało się faktycznie ustawić
            } else {
              gmZapisz(HASLO_PG_EDYCJA_KEY, noweHaslo);
            }
          }
        }
      }
    }

    statusEl.textContent = "Zapisuję zmiany...";
    const btnUpdate = znajdzPoSufiksie("_EditFormControl_btnUpdate");
    if (!btnUpdate) return stop("Brak przycisku Zapisz");
    klikMysza(btnUpdate);

    let zapisano = false;
    for (let i = 0; i < 75; i++) {
      await czekaj(400);
      if (!znajdzPoSufiksie("_EditFormControl_btnUpdate")) { zapisano = true; break; }
    }
    if (!zapisano) {
      statusEl.textContent = "⚠ Kliknięto Zapisz — edytor wciąż otwarty, sprawdź walidację formularza.";
      statusEl.style.color = "#b3261e";
      return;
    }

    statusEl.textContent = "✔ Konto " + imie + " " + nazwisko + " zaktualizowane (" + typ + ").";
    statusEl.style.color = "#0f6f5c";

    // Wyszukujemy i zapisujemy ID do formatki — tak samo jak przy tworzeniu
    await wyszukajIZapiszId(statusEl, imie, nazwisko, typ, wymagaLoginu(typ) ? lg : null, "ZAKTUALIZOWANE");

    // Jeśli nowy typ wymaga umiejętności — dodajemy je, tak jak przy tworzeniu.
    // (Zejście z typu z umiejętnościami na typ bez nich PG odpina automatycznie —
    // nic nie musimy tu robić.)
    if (WYMAGA_UMIEJETNOSCI.includes(typ)) {
      statusEl.textContent += " — dodaję umiejętności...";
      await czekaj(600);
      if (wymagaLoginu(typ)) {
        await rozpocznijUmiejetnosci(statusEl, lg);
      } else if (typ === "Fizjoterapeuta" && state.instNazwa === "FitnessAcademy") {
        await rozpocznijUmiejetnosci(statusEl, imie + " " + nazwisko, ["Spotkanie wprowadzające (SW)"], "zajec grupowych");
      }
    } else {
      zakonczProces(statusEl, typ);
    }
  }

  // Wspólna część: szuka konto (po loginie, albo po imieniu+nazwisku, gdy typ nie ma
  // loginu) i zapisuje jego ID do wspólnego stanu. Zwraca ID (string) albo null,
  // jeśli się nie udało — w obu przypadkach statusEl dostaje odpowiedni komunikat.
  async function wyszukajIZapiszId(statusEl, imie, nazwisko, typ, oczekiwanyLogin, czasownik) {
    czasownik = czasownik || "DODANE";
    statusEl.textContent = "✔ Konto " + imie + " " + nazwisko + " (" + typ + ") " + czasownik + " — szukam ID...";
    statusEl.style.color = "#0f6f5c";

    const wiersz = await wyszukajWierszWPG(statusEl, imie, nazwisko, oczekiwanyLogin, oczekiwanyLogin || nazwisko);
    if (wiersz === undefined || !wiersz) {
      statusEl.textContent = "✔ Konto " + czasownik + ", ale nie znalazłem wiersza w wyszukiwarce — wpisz ID ręcznie.";
      statusEl.style.color = "#b3261e";
      return null;
    }
    const id = wyciagnijIdZWiersza(wiersz);
    if (!id) {
      statusEl.textContent = "✔ Konto " + czasownik + ", znalazłem wiersz, ale nie rozpoznałem kolumny ID — wpisz ręcznie.";
      statusEl.style.color = "#b3261e";
      return null;
    }
    state.id = id;
    zapiszStan();
    statusEl.textContent = "✔ Konto " + imie + " " + nazwisko + " (" + typ + ") " + czasownik + ", ID = " + id + " (zapisane do formatki)";
    statusEl.style.color = "#0f6f5c";
    return id;
  }

  async function wyszukajISkopiujId(statusEl, lg, imie, nazwisko, typ) {
    const id = await wyszukajIZapiszId(statusEl, imie, nazwisko, typ, wymagaLoginu(typ) ? lg : null);
    if (!id) return;

    if (WYMAGA_UMIEJETNOSCI.includes(typ)) {
      statusEl.textContent += " — przechodzę do nadawania umiejętności...";
      await czekaj(600);
      await rozpocznijUmiejetnosci(statusEl, lg);
      // (kopiowanie wklejki nastąpi na końcu rozpocznijUmiejetnosci)
    } else {
      zakonczProces(statusEl, typ);
    }
  }

  // ---------- Perfect Gym: nadawanie umiejętności (Trener / Trener+Recepcja / Trener personalny) ----------
  // Tylko te typy kont dostają dodatkowe umiejętności (Recepcja/IZG — nie)
  const WYMAGA_UMIEJETNOSCI = ["Trener", "Trener+Recepcja", "Trener personalny", "Master Trener"];

  // Znajduje NAJBARDZIEJ WEWNĘTRZNY element z dokładnym tekstem (unika złapania
  // kontenera-rodzica, który też "zawiera" ten sam tekst przez dziecko).
  // Widoczność liczona przez realny rozmiar na ekranie (nie offsetParent — ten
  // zawodzi dla elementów z position:fixed, typowych dla rozwijanych list/menu).
  function maRozmiar(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function znajdzKlikalnyZTekstem(tekst) {
    for (const doc of wszystkieDokumenty()) {
      const kandydaci = [...doc.querySelectorAll("span, div, button, a")];
      const e = kandydaci.find(x => maRozmiar(x) && x.textContent.trim() === tekst &&
        ![...x.children].some(ch => ch.textContent.trim() === tekst));
      if (e) return e;
    }
    return null;
  }
  async function czekajNaKlikalnyZTekstem(tekst, maxMs) {
    const kroki = Math.ceil((maxMs || 5000) / 300);
    for (let i = 0; i < kroki; i++) {
      const e = znajdzKlikalnyZTekstem(tekst);
      if (e) return e;
      await czekaj(300);
    }
    return null;
  }

  // Poziom umiejętności nazywa się zawsze tak samo jak sama umiejętność
  const LISTA_UMIEJETNOSCI = [
    "Spotkanie wprowadzające (SW)",
    "Intro Treningowe (IT) / Konsultacja Treningowa",
    "Trening Personalny (TP)",
  ];

  function znajdzNiewybranyCombobox() {
    for (const doc of wszystkieDokumenty()) {
      const e = [...doc.querySelectorAll(".baf-combobox-placeholder")]
        .find(x => maRozmiar(x) && x.textContent.trim() === "Wybierz");
      if (e) return e;
    }
    return null;
  }
  async function czekajNaNiewybranyCombobox(maxMs) {
    const kroki = Math.ceil((maxMs || 5000) / 350);
    for (let i = 0; i < kroki; i++) {
      const e = znajdzNiewybranyCombobox();
      if (e) return e;
      await czekaj(350);
    }
    return null;
  }
  function znajdzPozycjeListyBaf(tekst) {
    const k = norm(tekst);
    for (const doc of wszystkieDokumenty()) {
      const e = [...doc.querySelectorAll(".baf-combobox-item")]
        .find(x => maRozmiar(x) && norm(x.textContent) === k);
      if (e) return e;
    }
    return null;
  }
  async function czekajNaPozycjeListyBaf(tekst, maxMs) {
    const kroki = Math.ceil((maxMs || 5000) / 350);
    for (let i = 0; i < kroki; i++) {
      const e = znajdzPozycjeListyBaf(tekst);
      if (e) return e;
      await czekaj(350);
    }
    return null;
  }
  function jakakolwiekPozycjaListy() {
    for (const doc of wszystkieDokumenty()) {
      const e = [...doc.querySelectorAll(".baf-combobox-item")].find(x => maRozmiar(x));
      if (e) return true;
    }
    return false;
  }
  async function wybierzZComboboxBaf(tekst, statusEl, etykieta) {
    const placeholder = await czekajNaNiewybranyCombobox(5000);
    if (!placeholder) {
      statusEl.textContent = "✋ Nie znalazłem pustej listy (" + etykieta + ") — dokończ ręcznie.";
      statusEl.style.color = "#b3261e";
      return false;
    }
    // Klik w sam placeholder czasem nie trafia w faktyczny element otwierający listę —
    // próbujemy też kolejnych poziomów rodzica, sprawdzając czy lista się otworzyła
    let cel = placeholder;
    let otwarto = false;
    for (let poziom = 0; poziom < 4 && cel && !otwarto; poziom++) {
      klikRealistycznie(cel);
      await czekaj(600);
      if (jakakolwiekPozycjaListy()) { otwarto = true; break; }
      cel = cel.parentElement;
    }
    const pozycja = await czekajNaPozycjeListyBaf(tekst, 5000);
    if (!pozycja) {
      statusEl.textContent = "✋ Nie znalazłem pozycji '" + tekst + "' na liście (" + etykieta + ") — dokończ ręcznie.";
      statusEl.style.color = "#b3261e";
      return false;
    }
    klikRealistycznie(pozycja);
    await czekaj(800);
    return true;
  }

  // KROK 1: przejście do modułu, wyszukanie pracownika po loginie, kliknięcie menu
  // (dropdown-button) i wybranie "Umiejętności".
  // KROK 2: dla 3 umiejętności (SW, IT/Konsultacja, TP) — dodanie wiersza, wybór
  // kategorii i poziomu (ten sam tekst), na koniec Zapisz.
  async function rozpocznijUmiejetnosci(statusEl, szukajTekst, listaUmiej, rolaWeryfikacja) {
    listaUmiej = listaUmiej || LISTA_UMIEJETNOSCI;
    statusEl.textContent = "Sprawdzam stronę...";
    statusEl.style.color = "#6b7280";

    // 1) upewniamy się, że jesteśmy na właściwej trasie (host + hash)
    const wlasciwyHash = "#/Employees/Employees";
    if (location.hash !== wlasciwyHash) {
      statusEl.textContent = "⏳ Przechodzę na stronę Umiejętności...";
      let cel = null;
      try { cel = new URL(location.href); } catch (e) {}
      if (cel) {
        cel.hash = wlasciwyHash;
        cel.searchParams.set("_wkf", String(Date.now())); // wymuszenie prawdziwej nawigacji
        gmZapisz(AUTO_UMIEJ_LOGIN_KEY, szukajTekst);
        gmZapisz(AUTO_UMIEJ_TS_KEY, String(Date.now()));
        gmZapisz(AUTO_UMIEJ_LISTA_KEY, JSON.stringify(listaUmiej));
        gmZapisz(AUTO_UMIEJ_ROLA_KEY, rolaWeryfikacja || "");
        location.href = cel.toString();
      }
      return;
    }

    // 2) pole wyszukiwania pracownika (searchbox) — login ALBO "Imię Nazwisko", gdy brak loginu
    statusEl.textContent = "Szukam pracownika (" + szukajTekst + ")...";
    let pole = null;
    for (let i = 0; i < 13 && !pole; i++) {
      for (const doc of wszystkieDokumenty()) {
        const kand = doc.querySelector('[aria-label="searchbox"]');
        if (kand && maRozmiar(kand)) { pole = kand; break; }
      }
      if (!pole) await czekaj(400);
    }
    if (!pole) {
      statusEl.textContent = "✋ Nie znalazłem pola wyszukiwania pracownika.";
      statusEl.style.color = "#b3261e";
      return;
    }
    ustawWartoscDojo(pole, szukajTekst);
    await czekaj(1500);

    // 3) znajdź WIERSZ pasujący do szukanego tekstu (a jeśli więcej niż jeden pasuje —
    //    zawęź po dodatkowej weryfikacji roli, np. "zajec grupowych"), i w NIM przycisk
    //    menu — nie pierwszy lepszy na całej stronie, żeby nie trafić w kogoś innego
    //    o tym samym imieniu i nazwisku
    statusEl.textContent = "Szukam wiersza pracownika i otwieram menu...";
    let menu = null;
    for (let i = 0; i < 13 && !menu; i++) {
      for (const doc of wszystkieDokumenty()) {
        const wszystkieWiersze = [...doc.querySelectorAll("tr")].filter(tr => maRozmiar(tr));
        if (wszystkieWiersze.length) {
          let kandydaci = wszystkieWiersze.filter(tr => norm(tr.textContent).includes(norm(szukajTekst)));
          if (kandydaci.length > 1 && rolaWeryfikacja) {
            const zawezone = kandydaci.filter(tr => norm(tr.textContent).includes(norm(rolaWeryfikacja)));
            if (zawezone.length) kandydaci = zawezone;
          }
          if (kandydaci.length) {
            const btn = kandydaci[0].querySelector(".baf-dropdown-button, baf\\:dropdown-button");
            if (btn && maRozmiar(btn)) { menu = btn; break; }
          }
        }
        // zapasowo (inna struktura listy bez <tr>) — jak dotychczas, pierwszy na stronie
        if (!menu) {
          const kand = [...doc.querySelectorAll(".baf-dropdown-button, baf\\:dropdown-button")].find(x => maRozmiar(x));
          if (kand) { menu = kand; break; }
        }
      }
      if (!menu) await czekaj(400);
    }
    if (!menu) {
      statusEl.textContent = "✋ Nie znalazłem przycisku menu przy pracowniku.";
      statusEl.style.color = "#b3261e";
      return;
    }
    klikPojedynczo(menu);
    await czekaj(900);

    // 4) "Umiejętności" z rozwiniętego menu — jeśli za pierwszym razem menu nie
    // zdążyło się w pełni rozwinąć, próbujemy kliknąć jeszcze raz zamiast się poddawać
    statusEl.textContent = "Klikam 'Umiejętności'...";
    let opcjaUmiej = await czekajNaKlikalnyZTekstem("Umiejętności", 5000);
    if (!opcjaUmiej) {
      klikPojedynczo(menu);
      await czekaj(900);
      opcjaUmiej = await czekajNaKlikalnyZTekstem("Umiejętności", 5000);
    }
    if (!opcjaUmiej) {
      statusEl.textContent = "✋ Nie znalazłem opcji 'Umiejętności' w rozwiniętym menu.";
      statusEl.style.color = "#b3261e";
      return;
    }
    klikPojedynczo(opcjaUmiej);
    await czekaj(1500);

    // 5) umiejętności z przekazanej listy — poziom nazywa się tak samo jak umiejętność
    for (const nazwa of listaUmiej) {
      // Sprawdzamy NAJPIERW, czy ta konkretna umiejętność już nie jest przypisana
      // (widoczna na liście, poza otwartym dropdownem — żaden nie jest teraz otwarty,
      // więc dopasowanie tekstu jednoznacznie wskazuje na już istniejący wiersz).
      // Jeśli jest — pomijamy dodawanie, żeby nie tworzyć duplikatu.
      if (znajdzKlikalnyZTekstem(nazwa)) {
        statusEl.textContent = "Umiejętność już przypisana: " + nazwa + " — pomijam.";
        await czekaj(300);
        continue;
      }

      statusEl.textContent = "Dodaję umiejętność: " + nazwa + "...";
      const btnDodaj = await czekajNaKlikalnyZTekstem("Dodaj umiejętność", 5000);
      if (!btnDodaj) {
        statusEl.textContent = "✋ Nie znalazłem przycisku 'Dodaj umiejętność' — dokończ ręcznie.";
        statusEl.style.color = "#b3261e";
        return;
      }
      klikPojedynczo(btnDodaj);
      await czekaj(900);

      if (!(await wybierzZComboboxBaf(nazwa, statusEl, "kategoria: " + nazwa))) return;
      if (!(await wybierzZComboboxBaf(nazwa, statusEl, "poziom: " + nazwa))) return;
      await czekaj(700); // odstęp przed kolejną umiejętnością
    }

    // 6) Zapisz
    statusEl.textContent = "Zapisuję umiejętności...";
    const btnZapisz = await czekajNaKlikalnyZTekstem("Zapisz", 5000);
    if (!btnZapisz) {
      statusEl.textContent = "✋ Dodano umiejętności (" + listaUmiej.join(", ") + "), ale nie znalazłem przycisku 'Zapisz' — zapisz ręcznie.";
      statusEl.style.color = "#b3261e";
      return;
    }
    klikPojedynczo(btnZapisz);
    await czekaj(1500);

    statusEl.textContent = "✔ Umiejętności (" + listaUmiej.join(", ") + ") dodane i zapisane.";
    statusEl.style.color = "#0f6f5c";
    if (state.typ) zakonczProces(statusEl, state.typ);
  }

  // ---------- UI ----------
  const css = `
    :root {
      --wkf-accent: #0f6f5c;
      --wkf-accent-dark: #0c5a4b;
      --wkf-accent-soft: #e2f0ec;
      --wkf-bg: #f6f4ee;
      --wkf-fg: #1b2733;
      --wkf-fg-muted: #6b7280;
      --wkf-border: #d8d3c6;
      --wkf-input-bg: #fdfcf9;
      --wkf-card-bg: #ffffff;
      --wkf-scale: 1;
    }
    #wkf-fab { position:fixed; right:18px; top:18px; z-index:999999;
      width:calc(52px * var(--wkf-scale)); height:calc(52px * var(--wkf-scale));
      border-radius:50%; background:var(--wkf-accent); color:#fff; border:none;
      display:flex; align-items:center; justify-content:center; padding:0;
      font-size:calc(22px * var(--wkf-scale)); line-height:1;
      cursor:pointer; box-shadow:0 6px 18px rgba(0,0,0,.3); transition:background .15s,transform .1s; }
    #wkf-fab:hover { background:var(--wkf-accent-dark); transform:scale(1.06); }
    #wkf-fab:active { transform:scale(.96); }
    #wkf-panel { position:fixed; right:18px; top:78px; z-index:999999;
      width:calc(420px * var(--wkf-scale)); max-width:95vw; height:82vh; overflow:auto;
      background:var(--wkf-bg); color:var(--wkf-fg); border:1px solid var(--wkf-border);
      border-radius:14px; box-shadow:0 12px 40px rgba(0,0,0,.3);
      padding:calc(16px * var(--wkf-scale));
      font-family:"Segoe UI",system-ui,sans-serif; font-size:calc(14px * var(--wkf-scale));
      scrollbar-width:thin; transform-origin:top right;
      opacity:0; transform:scale(0.08) translate(15%,15%); pointer-events:none;
      transition:opacity .2s ease, transform .25s cubic-bezier(.34,1.35,.64,1); }
    #wkf-panel.open { opacity:1; transform:scale(1) translate(0,0); pointer-events:auto; }
    #wkf-panel h3 { margin:0; font-size:calc(15px * var(--wkf-scale)); font-weight:700; letter-spacing:.01em; }
    #wkf-panel label { display:block; font-size:calc(11px * var(--wkf-scale)); font-weight:700;
      text-transform:uppercase; letter-spacing:.06em; color:var(--wkf-fg-muted); margin:calc(8px * var(--wkf-scale)) 0 calc(3px * var(--wkf-scale)); }
    #wkf-panel input, #wkf-panel select { width:100%; padding:calc(7px * var(--wkf-scale)) calc(9px * var(--wkf-scale));
      border:1px solid var(--wkf-border); border-radius:8px; font-size:calc(13px * var(--wkf-scale));
      background:var(--wkf-input-bg); color:var(--wkf-fg); box-sizing:border-box; transition:border-color .15s; }
    #wkf-panel input:focus, #wkf-panel select:focus { outline:none; border-color:var(--wkf-accent); }
    .wkf-row { display:flex; gap:calc(6px * var(--wkf-scale)); flex-wrap:wrap; margin-top:calc(8px * var(--wkf-scale)); }
    .wkf-btn { padding:calc(7px * var(--wkf-scale)) calc(12px * var(--wkf-scale)); border:none; border-radius:8px;
      background:var(--wkf-accent); color:#fff; font-size:calc(12px * var(--wkf-scale)); font-weight:600;
      cursor:pointer; transition:background .15s,transform .08s,box-shadow .15s; }
    .wkf-btn:hover { background:var(--wkf-accent-dark); box-shadow:0 2px 8px rgba(0,0,0,.15); }
    .wkf-btn:active { transform:scale(.97); }
    .wkf-btn.ghost { background:transparent; color:var(--wkf-accent); border:1px solid var(--wkf-accent); }
    .wkf-btn.ghost:hover { background:var(--wkf-accent-soft); }
    .wkf-btn.done { background:#1b2733; color:#fff; }
    .wkf-card { background:var(--wkf-card-bg); border:1px solid var(--wkf-border); border-radius:10px;
      margin-top:calc(10px * var(--wkf-scale)); overflow:hidden; }
    .wkf-card.hit { border-color:var(--wkf-accent); box-shadow:0 0 0 2px var(--wkf-accent-soft); }
    .wkf-card-head { display:flex; justify-content:space-between; align-items:center;
      padding:calc(7px * var(--wkf-scale)) calc(10px * var(--wkf-scale)); background:var(--wkf-accent-soft);
      border-bottom:1px solid var(--wkf-border); font-weight:600; font-size:calc(13px * var(--wkf-scale)); }
    .wkf-card-head .wkf-btn { min-width:calc(88px * var(--wkf-scale)); text-align:center; white-space:nowrap; }
    .wkf-card pre { margin:0; padding:calc(10px * var(--wkf-scale)); font:calc(12px * var(--wkf-scale))/1.6 Consolas,Menlo,monospace;
      white-space:pre-wrap; word-break:break-word; color:var(--wkf-fg); }
    .wkf-hint { font-size:calc(11px * var(--wkf-scale)); color:var(--wkf-fg-muted); margin-top:calc(6px * var(--wkf-scale)); }

    /* Ujednolicony system komunikatów/banerów — jeden wygląd niezależnie od tego,
       który konkretnie komunikat to jest. Kilka naraz układa się spójnie (ta sama
       czcionka, odstępy, promień zaokrąglenia), tylko kolor sygnalizuje wagę. */
    .wkf-banner { display:none; border-radius:8px; padding:calc(8px * var(--wkf-scale)) calc(10px * var(--wkf-scale));
      font-size:calc(12px * var(--wkf-scale)); font-weight:600; line-height:1.45; margin-top:calc(6px * var(--wkf-scale)); }
    .wkf-banner.show { display:block; }
    .wkf-banner.info { background:#e7f1ff; border:1px solid #2563eb; color:#1e3a8a; }
    .wkf-banner.warn { background:#fff4e5; border:1px solid #c77700; color:#7a4a00; }
    .wkf-banner.error { background:#fdecea; border:1px solid #b3261e; color:#7a1f18; }
    .wkf-banner.clickable { cursor:pointer; transition:filter .1s; }
    .wkf-banner.clickable:hover { filter:brightness(0.96); }
    .wkf-toggle { width:100%; margin-top:calc(10px * var(--wkf-scale)); }
    .wkf-swatch { width:26px; height:26px; border-radius:50%; border:2px solid transparent; cursor:pointer;
      display:inline-block; transition:transform .1s,border-color .15s; }
    .wkf-swatch:hover { transform:scale(1.1); }
    .wkf-swatch.active { border-color:var(--wkf-fg); box-shadow:0 0 0 2px var(--wkf-bg), 0 0 0 3px var(--wkf-fg); }

    /* Zębatka + widok ustawień z podzakładkami */
    .wkf-gear-btn { background:none; border:none; font-size:calc(20px * var(--wkf-scale)); line-height:1;
      cursor:pointer; padding:2px 6px; color:var(--wkf-fg-muted); border-radius:6px; transition:color .15s,background .15s,transform .2s; }
    .wkf-gear-btn:hover { color:var(--wkf-accent); background:var(--wkf-accent-soft); transform:rotate(25deg); }
    .wkf-back-btn { background:none; border:none; font-size:calc(13px * var(--wkf-scale)); font-weight:600;
      color:var(--wkf-fg-muted); cursor:pointer; padding:2px 4px; }
    .wkf-back-btn:hover { color:var(--wkf-accent); }
    .wkf-settings-tabbar { display:flex; gap:calc(4px * var(--wkf-scale)); border-bottom:1px solid var(--wkf-border);
      margin:calc(6px * var(--wkf-scale)) 0 calc(12px * var(--wkf-scale)); }
    .wkf-settings-tabbar button { flex:1; }
    .wkf-btn.tab { background:transparent; color:var(--wkf-fg-muted); border:none; border-radius:8px 8px 0 0;
      border-bottom:2px solid transparent; padding-bottom:calc(6px * var(--wkf-scale)); }
    .wkf-btn.tab.active { color:var(--wkf-accent); border-bottom-color:var(--wkf-accent); background:transparent; }
    .wkf-btn.tab:hover { background:var(--wkf-accent-soft); }

    /* Segmentowany przełącznik (np. Jasny/Ciemny/Systemowy) */
    .wkf-segmented { display:flex; border:1px solid var(--wkf-border); border-radius:8px; overflow:hidden; margin-top:6px; }
    .wkf-segmented button { flex:1; border:none; background:var(--wkf-input-bg); color:var(--wkf-fg);
      padding:calc(7px * var(--wkf-scale)) 0; font-size:calc(12px * var(--wkf-scale)); font-weight:600; cursor:pointer;
      border-right:1px solid var(--wkf-border); transition:background .15s,color .15s; }
    .wkf-segmented button:last-child { border-right:none; }
    .wkf-segmented button.active { background:var(--wkf-accent); color:#fff; }
    .wkf-segmented button:hover:not(.active) { background:var(--wkf-accent-soft); }

    /* Suwak skali */
    .wkf-slider { width:100%; -webkit-appearance:none; appearance:none; height:5px; border-radius:3px;
      background:var(--wkf-border); outline:none; margin:calc(10px * var(--wkf-scale)) 0; display:block; }
    .wkf-slider::-webkit-slider-thumb { -webkit-appearance:none; appearance:none; width:18px; height:18px;
      border-radius:50%; background:var(--wkf-accent); cursor:pointer; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.3); }
    .wkf-slider::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:var(--wkf-accent);
      cursor:pointer; border:2px solid #fff; box-shadow:0 1px 4px rgba(0,0,0,.3); }
    .wkf-slider-row { display:flex; align-items:center; justify-content:space-between; }
    .wkf-slider-val { font-size:calc(12px * var(--wkf-scale)); font-weight:700; color:var(--wkf-accent); min-width:38px; text-align:right; }
  `;

  function el(tag, attrs, html) {
    const e = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (html !== undefined) e.innerHTML = html;
    return e;
  }

  // Ujednolicony system komunikatów/banerów (patrz .wkf-banner w CSS) — jeden
  // wygląd niezależnie od tego, który to komunikat, żeby przy kilku naraz (a jeden
  // wniosek może ich mieć więcej niż jeden) całość wyglądała spójnie, nie chaotycznie.
  function stworzBaner(klikalny, tytul) {
    const attrs = { class: "wkf-banner" + (klikalny ? " clickable" : "") };
    if (tytul) attrs.title = tytul;
    return el("div", attrs, "");
  }
  // typ: null/"" = ukryj; "info" (niebieski) | "warn" (pomarańczowy) | "error" (czerwony)
  function ustawBaner(baner, typ, tekst) {
    baner.classList.remove("info", "warn", "error", "show");
    if (!typ) return;
    baner.textContent = tekst;
    baner.classList.add(typ, "show");
  }

  function kopiuj(txt, btn, defaultLabel) {
    const done = () => {
      btn.textContent = "Skopiowano ✓"; btn.classList.add("done");
      setTimeout(() => { btn.textContent = defaultLabel; btn.classList.remove("done"); }, 1500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(txt).then(done).catch(() => fallbackCopy(txt, done));
    } else fallbackCopy(txt, done);
  }
  function fallbackCopy(txt, done) {
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta); ta.select();
    document.execCommand("copy"); document.body.removeChild(ta); done();
  }

  // Automatyczne kopiowanie gotowej wklejki na sam koniec procesu (bez klikania
  // w kartę ręcznie) — żeby można było od razu wkleić gdzie trzeba
  function kopiujWklejkeKoncowa(statusEl, typ) {
    const rola = roles.find(r => r.label === typ);
    if (!rola) return;
    const tekst = wklejka(rola);

    // Próba cichego skopiowania w tle — bywa zablokowana przez przeglądarkę, gdy
    // nie ma świeżej, bezpośredniej interakcji użytkownika (a po długim automatycznym
    // łańcuchu kroków już jej nie ma) — dlatego NIE polegamy tylko na tym i dajemy
    // niżej też widoczny przycisk, który zadziała gwarantowanie za jednym kliknięciem.
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(tekst).catch(() => {});
      }
    } catch (e) {}

    const btn = el("button", { class: "wkf-btn", type: "button", style: "width:100%; margin-top:6px;" },
      "📋 Kopiuj gotową wklejkę");
    btn.addEventListener("click", () => kopiuj(tekst, btn, "📋 Kopiuj gotową wklejkę"));
    if (statusEl.parentElement) statusEl.parentElement.insertBefore(btn, statusEl.nextSibling);
  }

  // Otwiera stronę — nową kartą (domyślnie) albo przełącza BIEŻĄCĄ kartę, jeśli
  // w Ustawieniach włączone jest "Auto-przełączanie". W trybie przełączania wymusza
  // PRAWDZIWĄ nawigację (dopisując unikalny parametr), bo sama zmiana samego hasha
  // (przy tej samej domenie) bywa potraktowana jako "cicha" zmiana i realnie nie przenosi.
  function otworzStrone(url) {
    if (!ustawienia.autoPrzelaczanie) { window.open(url, "_blank"); return; }
    let cel = null;
    try { cel = new URL(url); } catch (e) {}
    const docelowy = cel ? (cel.searchParams.set("_wkf", String(Date.now())), cel.toString()) : url;
    // Panel na emplo bywa zbudowany wewnątrz zagnieżdżonej ramki (treść wniosku
    // czasem tam jest) — location.href w takiej ramce przeniosłoby TYLKO tę ramkę,
    // niewidocznie dla użytkownika, a cała widoczna karta zostałaby bez zmian.
    // Celujemy więc zawsze w window.top (całą kartę), z bezpiecznym fallbackiem.
    try {
      window.top.location.href = docelowy;
    } catch (e) {
      location.href = docelowy;
    }
  }

  // Prawdziwy koniec procesu dla danego konta: kopiuje wklejkę i — jeśli włączone
  // jest auto-przełączanie ORAZ to była część "Całego procesu" (nie pojedynczy krok
  // "Tylko PG") — wraca do tego samego wniosku na emplo, z którego to wszystko ruszyło.
  function zakonczProces(statusEl, typ) {
    kopiujWklejkeKoncowa(statusEl, typ);
    if (!ustawienia.autoPrzelaczanie || !state.wniosekId) { gmZapisz(HASLO_PG_EDYCJA_KEY, ""); gmZapisz(TRYB_EDYCJI_PG_KEY, ""); return; }
    const wniosekUrl = "https://bsof.emplo.com/app/Requests/CustomRequest/" + state.wniosekId;
    const rola = roles.find(r => r.label === typ);
    if (rola) gmZapisz(POWROT_WKLEJKA_KEY, wklejka(rola));
    gmZapisz(HASLO_PG_EDYCJA_KEY, ""); // jednorazowe — dopiero teraz, po WSZYSTKICH wywołaniach wklejka() powyżej
    gmZapisz(TRYB_EDYCJI_PG_KEY, "");
    // Przycisk pokazujemy ZAWSZE (pewniak) — a jeśli Auto-komentarz włączony,
    // DODATKOWO próbujemy sami wpisać i dodać komentarz. Gdyby auto-wpisywanie
    // się nie udało, przycisk i tak zostaje jako zapasowa opcja.
    gmZapisz(POKAZ_PRZYCISK_KEY, "1");
    gmZapisz(POKAZ_PRZYCISK_TS_KEY, String(Date.now()));
    if (ustawienia.autoZakonczenie) {
      gmZapisz(AUTO_KOMENTARZ_KEY, "1");
      gmZapisz(AUTO_KOMENTARZ_TS_KEY, String(Date.now()));
    }
    statusEl.textContent += " — wracam do wniosku emplo...";
    setTimeout(() => { location.href = wniosekUrl; }, 1800);
  }

  let panel, cardsBox, instBtn, fab;

  // Włącza przeciąganie elementu (za wskazany uchwyt) myszą, TYLKO gdy
  // ustawienia.zablokowane === false. Pozycja zapisuje się w GM storage pod
  // podanym kluczem i jest przywracana przy kolejnym załadowaniu strony.
  function wlaczPrzeciaganie(element, uchwyt, kluczPozycji, domyslnaSzer, domyslnaWys, zawszeOdblokowany, bezPrzywracaniaPozycji) {
    let ciagniemy = false, poruszony = false, startX = 0, startY = 0, startLeft = 0, startTop = 0;

    function ograniczDoEkranu(left, top) {
      // Mierzymy realny rozmiar TYLKO jeśli element jest akurat widoczny (offsetWidth>0);
      // gdy jest schowany (np. panel z display:none przed otwarciem), offsetWidth/Height
      // wynosi 0 — wtedy używamy znanych, stałych wymiarów zamiast błędnie liczyć od zera
      // (co wcześniej powodowało, że pozycja "skakała" inaczej na różnych stronach,
      // zależnie od tego, w którym momencie strona zdążyła pokazać panel).
      const w = element.offsetWidth || domyslnaSzer || 60;
      const h = element.offsetHeight || domyslnaWys || 40;
      const margines = 4;
      const maxLeft = Math.max(margines, window.innerWidth - w - margines);
      const maxTop = Math.max(margines, window.innerHeight - h - margines);
      return { left: Math.min(Math.max(left, margines), maxLeft), top: Math.min(Math.max(top, margines), maxTop) };
    }

    // Pointer Events + setPointerCapture: w odróżnieniu od mousedown/mousemove/mouseup,
    // GWARANTUJE że dalsze zdarzenia (i pointerup) trafią do "uchwyt" nawet gdy kursor
    // wyjedzie poza okno przeglądarki. Wcześniej (mouseup na document) puszczenie myszy
    // poza oknem czasem w ogóle nie docierało — "ciagniemy" zostawało zablokowane na
    // true na stałe, a element potem "uciekał" przy każdym kolejnym ruchu myszką.
    uchwyt.addEventListener("pointerdown", (e) => {
      if (!zawszeOdblokowany && ustawienia.zablokowane) return;
      // Klik w przycisk/pole wewnątrz uchwytu (np. ikonkę ⚙ w nagłówku) ma działać
      // normalnie — nie ma zaczynać przeciągania i przechwytywać kliknięcia
      // Klik w przycisk/pole WEWNĄTRZ uchwytu (np. ikonkę ⚙ w nagłówku panelu) ma
      // działać normalnie i nie zaczynać przeciągania. Ale gdy sam uchwyt JEST
      // przyciskiem (jak pływająca ikonka 📋) — to nie wyklucza samo siebie.
      const klikniety = e.target.closest && e.target.closest("button, input, select, a, textarea");
      if (klikniety && klikniety !== uchwyt) return;
      ciagniemy = true;
      poruszony = false;
      const r = element.getBoundingClientRect();
      startLeft = r.left; startTop = r.top;
      startX = e.clientX; startY = e.clientY;
      element.style.right = "auto";
      element.style.bottom = "auto";
      element.style.left = startLeft + "px";
      element.style.top = startTop + "px";
      try { uchwyt.setPointerCapture(e.pointerId); } catch (err) {}
      e.preventDefault();
    });
    uchwyt.addEventListener("pointermove", (e) => {
      if (!ciagniemy) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) poruszony = true;
      const pozycja = ograniczDoEkranu(startLeft + dx, startTop + dy);
      element.style.left = pozycja.left + "px";
      element.style.top = pozycja.top + "px";
    });
    const zakonczPrzeciaganie = (e) => {
      if (!ciagniemy) return;
      ciagniemy = false;
      try { uchwyt.releasePointerCapture(e.pointerId); } catch (err) {}
      if (poruszony) {
        // Zapisujemy jako PROCENT szerokości/wysokości okna, nie surowe piksele —
        // inaczej ta sama pozycja wypadała inaczej na stronach o innym rozmiarze
        // okna/przybliżeniu (mimo że okienko było "zablokowane" i nikt nic nie ciągnął).
        const r = element.getBoundingClientRect();
        const leftPct = (r.left / window.innerWidth) * 100;
        const topPct = (r.top / window.innerHeight) * 100;
        gmZapisz(kluczPozycji, JSON.stringify({ leftPct, topPct }));
        element._wkfPrzeciagniety = true; // tłumi przypadkowy "click" zaraz po przeciągnięciu
        setTimeout(() => { element._wkfPrzeciagniety = false; }, 0);
      }
    };
    uchwyt.addEventListener("pointerup", zakonczPrzeciaganie);
    uchwyt.addEventListener("pointercancel", zakonczPrzeciaganie);

    // przywróć zapisaną pozycję (jeśli była) — przeliczoną z procentów na piksele
    // WEDŁUG BIEŻĄCEGO okna, więc jest spójna niezależnie od jego rozmiaru.
    // Pomijane całkowicie, gdy bezPrzywracaniaPozycji=true (Home) — zamiast tego
    // zawsze zostaje domyślna pozycja z CSS, co po kilku nieudanych próbach
    // ustabilizowania okazało się najbardziej niezawodne na stronie, która
    // przechodzi przez kilka różnych adresów w łańcuchu logowania.
    if (!bezPrzywracaniaPozycji) try {
      const zapisana = JSON.parse(gmOdczytaj(kluczPozycji) || "null");
      if (zapisana && typeof zapisana.leftPct === "number" && typeof zapisana.topPct === "number") {
        const leftPx = (zapisana.leftPct / 100) * window.innerWidth;
        const topPx = (zapisana.topPct / 100) * window.innerHeight;
        const pozycja = ograniczDoEkranu(leftPx, topPx);
        element.style.right = "auto";
        element.style.bottom = "auto";
        element.style.left = pozycja.left + "px";
        element.style.top = pozycja.top + "px";
      }
    } catch (e) {}

    // Wymusza ponowne dopasowanie BIEŻĄCEJ pozycji do ekranu — wywoływane przy
    // otwieraniu panelu i zmianie rozmiaru okna, na wypadek gdyby (np. przez inny
    // rozmiar okna na innej stronie) część okienka wystawała poza widoczny obszar
    function przelicz() {
      if (!element.style.left || element.style.right !== "auto") return; // nie ustawione jeszcze na left/top
      const aktLeft = parseFloat(element.style.left) || 0;
      const aktTop = parseFloat(element.style.top) || 0;
      const pozycja = ograniczDoEkranu(aktLeft, aktTop);
      element.style.left = pozycja.left + "px";
      element.style.top = pozycja.top + "px";
    }
    return { przelicz };
  }

  function aktualizujKursoryPrzeciagania() {
    const kursorOdblokowany = !ustawienia.zablokowane;
    if (fab) fab.style.cursor = "move"; // ikonka zawsze przeciągalna, niezależnie od blokady
    if (panel) panel.style.cursor = kursorOdblokowany ? "move" : "default";
  }


  function aktualizujInstBtn() {
    if (!instBtn) return;
    // na emplo: po ręcznej zmianie klubu ponawiamy wykrywanie po kodzie
    if (!NA_HOME && pelnyTekstWniosku) {
      const inst = wykryjInstancje(pelnyTekstWniosku, state.klub);
      state.instNazwa = inst ? inst.nazwa : "";
      state.instUrl = inst ? inst.url : "";
    }
    if (state.instUrl) {
      instBtn.style.display = "";
      instBtn.textContent = "🏋 PG: " + state.instNazwa + " ➜";
    } else {
      instBtn.style.display = "";
      instBtn.textContent = "🏋 PG: nie wykryto instancji";
    }
  }

  function renderCards() {
    cardsBox.innerHTML = "";
    // Priorytet: aktualnie wybrany/używany typ (state.typ, np. ręcznie zmieniony w
    // selektorze) — a dopiero gdy nic nie jest jeszcze wybrane, surowe odgadnięcie z wniosku
    const trafiona = (state.typ && roles.some(r => r.label === state.typ)) ? state.typ : dopasujRole(funkcjaZWniosku);
    let items = [...roles.map(r => ({ label: r.label, text: wklejka(r) })),
                 { label: "Odebranie dostępów", text: wklejkaOdebranie() }];

    // Auto-wybór: gdy funkcja z wniosku pasuje do roli, pokazujemy tylko tę wklejkę
    if (trafiona && !pokazWszystkie) {
      items = items.filter(i => i.label === trafiona);
    } else if (trafiona) {
      items.sort((a, b) => (a.label === trafiona ? -1 : b.label === trafiona ? 1 : 0));
    }

    items.forEach(item => {
      const card = el("div", { class: "wkf-card" + (item.label === trafiona ? " hit" : "") });
      const head = el("div", { class: "wkf-card-head" });
      head.appendChild(el("span", null, item.label + (item.label === trafiona ? " ← z wniosku" : "")));
      const headBtns = el("div", { style: "display:flex; gap:6px;" });
      // Ta sama treść, ale bez linijek z hasłami (np. do wysłania komuś, kto nie
      // powinien ich widzieć) — inny kolor (ghost), żeby wyraźnie odróżnić od zwykłego Kopiuj
      const tekstBezHasel = item.text.split("\n")
        .filter(l => !l.startsWith("Hasło do Home:") && !l.startsWith("Hasło do PG:"))
        .join("\n");
      const btnBezHasel = el("button", { class: "wkf-btn ghost", type: "button", title: "Kopiuje bez linijek z hasłami" }, "Kopiuj bez haseł");
      btnBezHasel.addEventListener("click", () => kopiuj(tekstBezHasel, btnBezHasel, "Kopiuj bez haseł"));
      headBtns.appendChild(btnBezHasel);
      const btn = el("button", { class: "wkf-btn", type: "button" }, "Kopiuj");
      btn.addEventListener("click", () => kopiuj(item.text, btn, "Kopiuj"));
      headBtns.appendChild(btn);
      head.appendChild(headBtns);
      card.appendChild(head);
      const pre = el("pre");
      pre.textContent = item.text;
      card.appendChild(pre);
      cardsBox.appendChild(card);
    });

    if (trafiona) {
      const t = el("button", { class: "wkf-btn ghost wkf-toggle", type: "button" },
        pokazWszystkie ? "Pokaż tylko wklejkę z wniosku" : "Pokaż pozostałe wklejki");
      t.addEventListener("click", () => { pokazWszystkie = !pokazWszystkie; renderCards(); });
      cardsBox.appendChild(t);
    }
    aktualizujInstBtn();
  }

  function pole(labelTxt, key, placeholder) {
    const wrapper = el("div");
    wrapper.appendChild(el("label", null, labelTxt));
    const input = el("input", { placeholder: placeholder || "", autocomplete: "off", name: "wkf-f-" + key });
    input.value = state[key];
    input.addEventListener("input", () => { state[key] = input.value; zapiszStan(); renderCards(); });
    wrapper.appendChild(input);
    return { wrapper, input };
  }

  // Selektor typu konta (wykryty z wniosku, można zmienić ręcznie) — używany na
  // każdym etapie: emplo, Home i PG, żeby zawsze było wiadomo/edytowalne, co zakładamy
  function budujSelektorTypu() {
    const wrapper = el("div");
    wrapper.appendChild(el("label", null, "Typ konta (wykryty z wniosku — możesz zmienić)"));
    const select = el("select", { style: "width:100%; padding:7px 9px; border:1px solid #d8d3c6; border-radius:6px; font-size:13px; background:#fdfcf9;" });
    Object.keys(ROLE_PG).forEach(t => select.appendChild(el("option", { value: t }, t)));
    if (state.typ && ROLE_PG[state.typ]) select.value = state.typ;
    select.addEventListener("change", () => { state.typ = select.value; zapiszStan(); if (typeof renderCards === "function" && cardsBox) renderCards(); });
    wrapper.appendChild(select);
    return { wrapper, select };
  }

  function buildPanel() {
    panel = el("div", { id: "wkf-panel" });

    const naglowek = el("div", { id: "wkf-naglowek", style: "display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;" });
    naglowek.appendChild(el("h3", { style: "margin:0;" }, "EmploMaster"));
    const naglowekPrzyciski = el("div", { style: "display:flex; align-items:center; gap:2px;" });
    const minimizeBtn = el("button", { class: "wkf-gear-btn", type: "button", title: "Zminimalizuj" }, "−");
    minimizeBtn.addEventListener("click", () => panel.classList.remove("open"));
    naglowekPrzyciski.appendChild(minimizeBtn);
    const gearBtn = el("button", { class: "wkf-gear-btn", type: "button", title: "Ustawienia" }, "⚙");
    naglowekPrzyciski.appendChild(gearBtn);
    naglowek.appendChild(naglowekPrzyciski);
    panel.appendChild(naglowek);

    const pImie = pole("Imię i nazwisko", "imie");
    const pKlub = pole("Klub", "klub");
    const pId = pole("Numer ID konta PG", "id");
    const pSuf = pole("Nr przy loginie (opcjonalnie)", "sufiks", "np. 2 → adam.nowak2");
    panel.append(pImie.wrapper, pKlub.wrapper, pId.wrapper, pSuf.wrapper);

    // hasło
    const pHasWrap = el("div");
    pHasWrap.appendChild(el("label", null, "Hasło do Home"));
    const hasInput = el("input", { style: "font-family:Consolas,Menlo,monospace;", autocomplete: "new-password", name: "wkf-haslo-nowe" });
    hasInput.value = state.haslo;
    hasInput.addEventListener("input", () => { state.haslo = hasInput.value; zapiszStan(); renderCards(); });
    pHasWrap.appendChild(hasInput);
    panel.appendChild(pHasWrap);

    const row = el("div", { class: "wkf-row", style: "margin-top:14px;" });
    [["Kopiuj login", () => login()],
    ].forEach(([label, get]) => {
      const b = el("button", { class: "wkf-btn ghost", type: "button" }, label);
      b.addEventListener("click", () => { const t = get(); if (t) kopiuj(t, b, label); });
      row.appendChild(b);
    });

    // Przycisk instancji Perfect Gym — zmienia się wg wykrytej sieci. W tym samym
    // rzędzie co "Kopiuj login" (obie to szybkie, pomocnicze akcje przy danych powyżej)
    instBtn = el("button", { class: "wkf-btn ghost", type: "button" },
      "🏋 PG: nie wykryto instancji");
    instBtn.addEventListener("click", () => {
      if (state.instUrl) window.open(state.instUrl, "_blank");
    });
    row.appendChild(instBtn);
    panel.appendChild(row);

    let selTypRef = null;

    if (NA_HOME) {
      const { wrapper: selTypWrapH, select: selTypH } = budujSelektorTypu();
      panel.appendChild(selTypWrapH);
      selTypRef = selTypH;

      const rowH = el("div", { class: "wkf-row" });
      const sprawdzZalozBtn = el("button", { class: "wkf-btn", type: "button" }, "📧 Sprawdź i załóż skrzynkę");
      rowH.appendChild(sprawdzZalozBtn);
      const pgZHomeBtn = el("button", { class: "wkf-btn", type: "button" }, "🏋 Załóż konto PG");
      rowH.appendChild(pgZHomeBtn);
      panel.appendChild(rowH);

      const statusEl = el("div", { class: "wkf-hint", style: "font-size:13px; font-weight:600; margin-top:8px;" }, "");
      panel.appendChild(statusEl);

      sprawdzZalozBtn.addEventListener("click", () => sprawdzIZalozSkrzynke(statusEl));
      pgZHomeBtn.addEventListener("click", () => {
        try {
          if (!state.instUrl) { statusEl.textContent = "Nie wykryto instancji PG — wróć na wniosek emplo."; statusEl.style.color = "#b3261e"; return; }
          const typ = selTypH.value;
          gmZapisz(AUTO_TYP_KEY, typ || "");
          gmZapisz(AUTO_TS_KEY, String(Date.now()));
          statusEl.textContent = ustawienia.autoPrzelaczanie ? "⏳ Przechodzę do PG (" + state.instNazwa + ")..." : "⏳ Otwieram PG (" + state.instNazwa + ") w nowej karcie...";
          statusEl.style.color = "#6b7280";
          otworzStrone(state.instUrl);
        } catch (e) {
          statusEl.textContent = "❌ Błąd nawigacji: " + (e && e.message ? e.message : e);
          statusEl.style.color = "#b3261e";
        }
      });

      const rowH2 = el("div", { class: "wkf-row" });
      const odswiez = el("button", { class: "wkf-btn ghost", type: "button" },
        "↻ Odśwież dane z emplo");
      rowH2.appendChild(odswiez);
      panel.appendChild(rowH2);

      odswiez.addEventListener("click", () => {
        wczytajStan();
        refs.pImie.input.value = state.imie;
        refs.pKlub.input.value = state.klub;
        renderCards();
      });
      panel.appendChild(el("div", { class: "wkf-hint" },
        "Dane przeniesione z wniosku emplo. Możesz je poprawić ręcznie."));

      // Auto-kontynuacja: jeśli przed chwilą (do 60s) przycisk na emplo przekierował
      // tu, od razu sprawdzamy i (jeśli trzeba) zakładamy skrzynkę
      (function wznowHomeJesliTrzeba() {
        const auto = gmOdczytaj(AUTO_HOME_KEY);
        const autoTs = parseInt(gmOdczytaj(AUTO_HOME_TS_KEY) || "0", 10);
        if (auto && Date.now() - autoTs < 180000) {
          gmZapisz(AUTO_HOME_KEY, "");
          gmZapisz(AUTO_HOME_TS_KEY, "");
          statusEl.textContent = "▶ Jestem na Home — sprawdzam skrzynkę...";
          statusEl.style.color = "#6b7280";
          setTimeout(async () => {
            const wynik = await sprawdzIZalozSkrzynke(statusEl);

            // Część "Całego procesu": jeśli był zapisany zamiar kontynuacji do PG,
            // TA SAMA karta teraz tam przechodzi (zwykła nawigacja — przeglądarka jej
            // nie blokuje, w przeciwieństwie do otwierania nowego okna z poziomu
            // asynchronicznego kodu). Rusza TYLKO gdy skrzynkę faktycznie założono.
            const chainTyp = gmOdczytaj(CHAIN_PG_TYP_KEY);
            const chainTs = parseInt(gmOdczytaj(CHAIN_PG_TS_KEY) || "0", 10);
            if (chainTs && Date.now() - chainTs < 120000) {
              gmZapisz(CHAIN_PG_TYP_KEY, "");
              gmZapisz(CHAIN_PG_TS_KEY, "");
              if (wynik === "istnieje") {
                statusEl.textContent += " — ZATRZYMANO cały proces: skrzynka już istniała, sprawdź czy ta osoba nie ma już u nas konta, zanim założysz cokolwiek w PG.";
                statusEl.style.color = "#b3261e";
              } else if (wynik !== "zalozona") {
                statusEl.textContent += " — ZATRZYMANO: nie udało się założyć skrzynki, popraw ręcznie przed przejściem do PG.";
                statusEl.style.color = "#b3261e";
              } else if (!state.instUrl) {
                statusEl.textContent += " — ⚠ Nie wykryto instancji PG, przejdź tam ręcznie.";
                statusEl.style.color = "#b3261e";
              } else {
                statusEl.textContent += " — przechodzę do PG (" + state.instNazwa + ")...";
                gmZapisz(AUTO_TYP_KEY, chainTyp || "");
                gmZapisz(AUTO_TS_KEY, String(Date.now()));
                setTimeout(() => { location.href = state.instUrl; }, 700);
              }
            }
          }, 500);
        }
      })();
    } else if (NA_PG) {
      const { wrapper: selTypWrap, select: selTyp } = budujSelektorTypu();
      panel.appendChild(selTypWrap);
      selTypRef = selTyp;

      const rowPG = el("div", { class: "wkf-row" });
      const sprawdzPGBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "🔍 Sprawdź, czy istnieje w PG");
      rowPG.appendChild(sprawdzPGBtn);
      const wypelnijBtn = el("button", { class: "wkf-btn", type: "button" }, "🏋 Załóż konto PG");
      rowPG.appendChild(wypelnijBtn);
      const edytujPGBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "✏️ Edytuj konto w PG");
      rowPG.appendChild(edytujPGBtn);
      panel.appendChild(rowPG);

      const rowDrugieKonto = el("div", { class: "wkf-row" });
      const drugieKontoBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "🆕 Załóż DRUGIE konto (wspólny e-mail)");
      rowDrugieKonto.appendChild(drugieKontoBtn);
      panel.appendChild(rowDrugieKonto);
      panel.appendChild(el("div", { class: "wkf-hint" },
        "Dla osoby mającej już jedno konto PG (np. jest Recepcją i Trenerem personalnym) — login do PG dostaje numer (\"Nr przy loginie\" powyżej, domyślnie 2), ale adres e-mail zostaje bez numeru, wspólny dla obu kont."));

      if (state.wniosekId) {
        const rowPowrot = el("div", { class: "wkf-row" });
        const powrotBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "↩ Powrót do wniosku emplo");
        powrotBtn.addEventListener("click", () => {
          otworzStrone("https://bsof.emplo.com/app/Requests/CustomRequest/" + state.wniosekId);
        });
        rowPowrot.appendChild(powrotBtn);
        panel.appendChild(rowPowrot);
      }

      const statusPG = el("div", { class: "wkf-hint", style: "font-size:13px; font-weight:600; margin-top:8px;" }, "");
      panel.appendChild(statusPG);

      sprawdzPGBtn.addEventListener("click", () => {
        const czesci = ladnaForma(state.imie).split(/\s+/).filter(Boolean);
        const imie = czesci[0] || "", nazwisko = czesci.slice(1).join(" ");
        if (!imie || !nazwisko) { statusPG.textContent = "Uzupełnij najpierw imię i nazwisko."; statusPG.style.color = "#b3261e"; return; }
        sprawdzCzyIstniejeWPG(statusPG, imie, nazwisko, wymagaLoginu(selTyp.value) ? login() : null);
      });

      function czyWlasciwaInstancja() {
        if (!state.instUrl) return true; // nie wykryto instancji — nie blokujemy, użytkownik działa ręcznie
        try {
          const cel = new URL(state.instUrl);
          // sam host to za mało — różne podstrony tej samej instancji (np. #/Employees/Employees
          // zamiast #/Clubs/Web//SystemMan/Employees/Employees.aspx) mają inny hash/trasę
          return cel.host === location.host && cel.hash === location.hash;
        } catch (e) { return true; }
      }

      // Sprawdza, czy jesteśmy na właściwej instancji; jeśli nie — zapamiętuje zamiar
      // (tworzenie albo edycja) i przenosi tam (wymuszoną, prawdziwą nawigacją).
      // Zwraca true, jeśli już jesteśmy na miejscu i można działać od razu.
      function przejdzNaInstancjeLubZostan(akcja) {
        if (czyWlasciwaInstancja()) return true;
        statusPG.textContent = "⏳ To nie ta instancja (" + state.instNazwa + ") — przechodzę na właściwą...";
        statusPG.style.color = "#6b7280";
        gmZapisz(AUTO_TYP_KEY, selTyp.value);
        gmZapisz(AUTO_AKCJA_KEY, akcja);
        gmZapisz(AUTO_TS_KEY, String(Date.now()));
        // Sama zmiana location.href, gdy różni się tylko hash (ta sama domena),
        // bywa potraktowana jako "cicha" nawigacja w obrębie tej samej strony i
        // realnie NIE przenosi w przeglądarce. Dopisujemy więc unikalny parametr
        // (zmiana w query, nie tylko w hashu), co wymusza prawdziwe przeładowanie.
        let cel = null;
        try { cel = new URL(state.instUrl); } catch (e) {}
        if (cel) {
          cel.searchParams.set("_wkf", String(Date.now()));
          location.href = cel.toString();
        } else {
          location.href = state.instUrl;
        }
        return false;
      }

      edytujPGBtn.addEventListener("click", () => {
        if (!state.imie) { statusPG.textContent = "Uzupełnij najpierw imię i nazwisko."; statusPG.style.color = "#b3261e"; return; }
        if (!przejdzNaInstancjeLubZostan("edytuj")) return;
        edytujKontoPG(statusPG, selTyp.value);
      });

      wypelnijBtn.addEventListener("click", () => {
        if (!przejdzNaInstancjeLubZostan("utworz")) return;
        wypelnijFormularzPG(statusPG, selTyp.value);
      });

      drugieKontoBtn.addEventListener("click", () => {
        if (!state.sufiks) {
          state.sufiks = "2";
          pSuf.input.value = "2";
          zapiszStan();
          renderCards();
        }
        if (!przejdzNaInstancjeLubZostan("utworz")) return;
        wypelnijFormularzPG(statusPG, selTyp.value);
      });

      // Auto-kontynuacja: jeśli przed chwilą (do 4 min) skrypt sam przekierował tu z innej
      // instancji, wznawiamy zamierzoną akcję (tworzenie albo edycja) bez ponownego klikania.
      // WAŻNE: ruszamy DOPIERO po jawnym sprawdzeniu, że jesteśmy na oczekiwanej instancji
      // (host zgodny z state.instUrl) — nie ufamy ślepo samemu przekierowaniu/timerowi.
      (async function wznowJesliTrzeba() {
        const autoTs = parseInt(gmOdczytaj(AUTO_TS_KEY) || "0", 10);
        if (!autoTs) return; // nic nie czeka na wznowienie — normalny start
        if (Date.now() - autoTs >= 240000) {
          // Minęło zbyt dużo czasu (>4 min) — np. długie przekierowanie logowania SSO.
          // Pokazujemy to WPROST zamiast cicho nic nie robić, żeby było wiadomo, co się stało.
          statusPG.textContent = "⚠ Minęło zbyt dużo czasu od kliknięcia (SSO/wolne ładowanie?) — dokończ ręcznie.";
          statusPG.style.color = "#b3261e";
          gmZapisz(AUTO_TYP_KEY, "");
          gmZapisz(AUTO_AKCJA_KEY, "");
          gmZapisz(AUTO_TS_KEY, "");
          return;
        }
        const autoTyp = gmOdczytaj(AUTO_TYP_KEY) || "";
        const autoAkcja = gmOdczytaj(AUTO_AKCJA_KEY) || "utworz";

        let oczekiwanyHost = null;
        try { if (state.instUrl) oczekiwanyHost = new URL(state.instUrl).host; } catch (e) {}
        if (oczekiwanyHost && location.host !== oczekiwanyHost) {
          // jeszcze nie ta strona (np. trwa przekierowanie logowania) — NIE konsumujemy
          // flagi i NIE ruszamy niczego; spróbujemy ponownie po kolejnym przeładowaniu
          statusPG.textContent = "⏳ Czekam, aż strona przejdzie na właściwą instancję (" + oczekiwanyHost + ")...";
          statusPG.style.color = "#6b7280";
          return;
        }

        gmZapisz(AUTO_TYP_KEY, "");
        gmZapisz(AUTO_AKCJA_KEY, "");
        gmZapisz(AUTO_TS_KEY, "");
        if (autoTyp && ROLE_PG[autoTyp]) selTyp.value = autoTyp;

        statusPG.textContent = "▶ Jestem na właściwej instancji — wznawiam...";
        statusPG.style.color = "#6b7280";
        // dajemy stronie (Angular SPA) chwilę na doładowanie się po nawigacji
        setTimeout(() => {
          if (autoAkcja === "edytuj") edytujKontoPG(statusPG, selTyp.value);
          else wypelnijFormularzPG(statusPG, selTyp.value);
        }, 600);
      })();

      // Auto-kontynuacja kroku umiejętności: jeśli przed chwilą (do 90s) skrypt
      // sam przekierował tu z przycisku testowego (po zmianie trasy na Employees/Employees)
      (function wznowUmiejetnosciJesliTrzeba() {
        const autoLg = gmOdczytaj(AUTO_UMIEJ_LOGIN_KEY);
        const autoTs = parseInt(gmOdczytaj(AUTO_UMIEJ_TS_KEY) || "0", 10);
        if (autoLg && Date.now() - autoTs < 90000) {
          let listaOdtworzona = null;
          try { listaOdtworzona = JSON.parse(gmOdczytaj(AUTO_UMIEJ_LISTA_KEY) || "null"); } catch (e) {}
          const rolaOdtworzona = gmOdczytaj(AUTO_UMIEJ_ROLA_KEY) || "";
          gmZapisz(AUTO_UMIEJ_LOGIN_KEY, "");
          gmZapisz(AUTO_UMIEJ_TS_KEY, "");
          gmZapisz(AUTO_UMIEJ_LISTA_KEY, "");
          gmZapisz(AUTO_UMIEJ_ROLA_KEY, "");
          statusPG.textContent = "▶ Jestem na stronie Umiejętności — wznawiam...";
          statusPG.style.color = "#6b7280";
          setTimeout(() => rozpocznijUmiejetnosci(statusPG, autoLg, listaOdtworzona, rolaOdtworzona), 600);
        }
      })();

      panel.appendChild(el("div", { class: "wkf-hint" },
        "Ostatni etap: dane z wniosku pod ręką — kopiuj i wklejaj w Perfect Gym."));
    } else {
      const { wrapper: selTypWrapE, select: selTypE } = budujSelektorTypu();
      selTypWrapE.style.marginTop = "10px";
      panel.appendChild(selTypWrapE);
      selTypRef = selTypE;

      const rowAkcje = el("div", { class: "wkf-row", style: "margin-top:8px;" });
      const calyProcesBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "🚀 Cały proces");
      rowAkcje.appendChild(calyProcesBtn);
      const homeBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "📧 Tylko Home");
      rowAkcje.appendChild(homeBtn);
      const pgBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "🏋 Tylko PG");
      rowAkcje.appendChild(pgBtn);

      // Komunikaty pod przyciskami akcji — trzy niezależne, ale WIZUALNIE SPÓJNE
      // banery (ten sam styl .wkf-banner, tylko inny kolor wg wagi). Może być
      // widocznych kilka naraz, jeden wniosek bywa ma więcej niż jeden problem.

      // 1) Istniejące komentarze — informacyjny, klikalny (przewija do komentarzy)
      const bannerKomentarzy = stworzBaner(true, "Kliknij, aby przejść do komentarzy");
      bannerKomentarzy.addEventListener("click", () => {
        for (const doc of wszystkieDokumentyOdGory()) {
          const cel = doc.querySelector(".jsComments") || doc.querySelector("li.jsCommentView");
          if (cel && cel.scrollIntoView) { cel.scrollIntoView({ behavior: "smooth", block: "start" }); break; }
        }
      });
      panel.appendChild(bannerKomentarzy);

      aktualizujBanerKomentarzy = () => {
        const liczba = policzKomentarzeNaWniosku();
        ustawBaner(bannerKomentarzy, liczba > 0 ? "info" : null,
          "💬 Ten wniosek ma już " + liczba + (liczba === 1 ? " komentarz" : " komentarze") +
          " — kliknij, aby przejść i sprawdzić, może zawiera coś ważnego.");
      };

      // 2) Identyfikacja typu konta — trzy stany: brak banera (normalna
      // identyfikacja), pomarańczowy "z tytułu" (awaryjnie, nie blokuje), czerwony
      // "brak" (nic się nie udało rozpoznać — blokuje TYLKO "Cały proces")
      const bannerIdentyfikacji = stworzBaner(false);
      panel.appendChild(bannerIdentyfikacji);

      aktualizujBanerIdentyfikacji = () => {
        if (identyfikacjaTypu === "tytul") {
          ustawBaner(bannerIdentyfikacji, "warn",
            "ℹ️ Typ konta ustalony awaryjnie z tytułu wniosku (nie znaleziono w zaznaczonej funkcji PG).");
          calyProcesBtn.disabled = false;
          calyProcesBtn.style.opacity = "1";
        } else if (identyfikacjaTypu === "brak") {
          ustawBaner(bannerIdentyfikacji, "error",
            "⛔ NIE UDAŁO SIĘ rozpoznać typu konta — ani z zaznaczonej funkcji pod dostępem do PG, ani z tytułu wniosku. Wybierz typ ręcznie w polu powyżej. \"Cały proces\" zablokowany, dopóki typ nie zostanie ustalony.");
          calyProcesBtn.disabled = true;
          calyProcesBtn.style.opacity = "0.5";
        } else {
          ustawBaner(bannerIdentyfikacji, null);
          calyProcesBtn.disabled = false;
          calyProcesBtn.style.opacity = "1";
        }
      };

      // 3) Sprzeczność tytułu z zaznaczoną funkcją PG — powiadomienie, bez blokady
      const bannerBledu = stworzBaner(false);
      panel.appendChild(bannerBledu);
      panel.appendChild(rowAkcje);

      aktualizujBanerBledu = () => {
        ustawBaner(bannerBledu, wniosekBledny ? "warn" : null,
          wniosekBledny ? "⚠ SPRAWDŹ WNIOSEK RĘCZNIE: " + wniosekBledny.opis : "");
      };

      const statusEmplo = el("div", { class: "wkf-hint", style: "font-size:13px; font-weight:600; margin-top:4px;" }, "");
      panel.appendChild(statusEmplo);

      calyProcesBtn.addEventListener("click", () => {
        try {
          if (identyfikacjaTypu === "brak") { statusEmplo.textContent = "⛔ Zablokowane — nie udało się rozpoznać typu konta, wybierz ręcznie."; statusEmplo.style.color = "#b3261e"; return; }
          if (!login()) { statusEmplo.textContent = "Uzupełnij najpierw imię i nazwisko."; statusEmplo.style.color = "#b3261e"; return; }
          if (!state.instUrl) { statusEmplo.textContent = "Nie wykryto instancji PG — sprawdź dane klubu."; statusEmplo.style.color = "#b3261e"; return; }
          const typ = selTypE.value;
          gmZapisz(AUTO_HOME_KEY, "1");
          gmZapisz(AUTO_HOME_TS_KEY, String(Date.now()));
          // Zamiar kontynuacji: karta Home, PO potwierdzeniu sukcesu, sama nawiguje
          // (w tej samej karcie) na PG i tam zakłada konto. Otwieranie od razu DRUGIEGO
          // okna z PG było tu wcześniej i przeglądarka (Edge) je blokowała jako popup.
          gmZapisz(CHAIN_PG_TYP_KEY, typ || "");
          gmZapisz(CHAIN_PG_TS_KEY, String(Date.now()));
          statusEmplo.textContent = ustawienia.autoPrzelaczanie
            ? "⏳ Przechodzę do Home — po sukcesie sam przejdę do PG, a na końcu wrócę tutaj..."
            : "⏳ Otwieram Home — po potwierdzeniu sukcesu sam przejdzie do PG...";
          statusEmplo.style.color = "#6b7280";
          otworzStrone(HOME_URL);
        } catch (e) {
          statusEmplo.textContent = "❌ Błąd: " + (e && e.message ? e.message : e);
          statusEmplo.style.color = "#b3261e";
        }
      });

      homeBtn.addEventListener("click", () => {
        try {
          if (!login()) { statusEmplo.textContent = "Uzupełnij najpierw imię i nazwisko."; statusEmplo.style.color = "#b3261e"; return; }
          gmZapisz(AUTO_HOME_KEY, "1");
          gmZapisz(AUTO_HOME_TS_KEY, String(Date.now()));
          statusEmplo.textContent = ustawienia.autoPrzelaczanie ? "⏳ Przechodzę do Home..." : "⏳ Otwieram Home w nowej karcie...";
          statusEmplo.style.color = "#6b7280";
          otworzStrone(HOME_URL);
        } catch (e) {
          statusEmplo.textContent = "❌ Błąd: " + (e && e.message ? e.message : e);
          statusEmplo.style.color = "#b3261e";
        }
      });

      pgBtn.addEventListener("click", () => {
        try {
          if (!login()) { statusEmplo.textContent = "Uzupełnij najpierw imię i nazwisko."; statusEmplo.style.color = "#b3261e"; return; }
          if (!state.instUrl) { statusEmplo.textContent = "Nie wykryto instancji PG — sprawdź dane klubu."; statusEmplo.style.color = "#b3261e"; return; }
          const typ = selTypE.value;
          gmZapisz(AUTO_TYP_KEY, typ || "");
          gmZapisz(AUTO_TS_KEY, String(Date.now()));
          statusEmplo.textContent = ustawienia.autoPrzelaczanie ? "⏳ Przechodzę do PG (" + state.instNazwa + ")..." : "⏳ Otwieram PG (" + state.instNazwa + ") w nowej karcie...";
          statusEmplo.style.color = "#6b7280";
          otworzStrone(state.instUrl);
        } catch (e) {
          statusEmplo.textContent = "❌ Błąd: " + (e && e.message ? e.message : e);
          statusEmplo.style.color = "#b3261e";
        }
      });

      panel.appendChild(el("div", { class: "wkf-hint" },
        "Dane odczytane z wniosku możesz poprawić ręcznie — zapisują się automatycznie."));
    }

    cardsBox = el("div");
    panel.appendChild(cardsBox);

    // ----- Wszystko od nagłówka w dół to widok "Dane" -----
    const dataContent = el("div", { id: "wkf-widok-dane" });
    while (naglowek.nextSibling) dataContent.appendChild(naglowek.nextSibling);

    // ----- Widok Ustawień (otwierany zębatką), z podzakładkami Wygląd / Zachowanie / Hasła -----
    const settingsContent = el("div", { id: "wkf-widok-ustawien", style: "display:none;" });

    const ustawieniaNaglowek = el("div", { style: "display:flex; align-items:center; gap:8px; margin-bottom:4px;" });
    const wrocBtn = el("button", { class: "wkf-back-btn", type: "button" }, "← Wróć");
    ustawieniaNaglowek.appendChild(wrocBtn);
    ustawieniaNaglowek.appendChild(el("h3", { style: "margin:0; font-size:15px;" }, "Ustawienia"));
    settingsContent.appendChild(ustawieniaNaglowek);

    const settingsTabbar = el("div", { class: "wkf-settings-tabbar" });
    const stabWyglad = el("button", { class: "wkf-btn tab active", type: "button" }, "🎨 Wygląd");
    const stabZachowanie = el("button", { class: "wkf-btn tab", type: "button" }, "⚙️ Zachowanie");
    const stabHasla = el("button", { class: "wkf-btn tab", type: "button" }, "🔑 Hasła");
    settingsTabbar.appendChild(stabWyglad);
    settingsTabbar.appendChild(stabZachowanie);
    settingsTabbar.appendChild(stabHasla);
    settingsContent.appendChild(settingsTabbar);

    // ===== Podzakładka: Wygląd (czysto wizualne — kolor, tryb, skala, pozycja) =====
    const wygladPanel = el("div");

    wygladPanel.appendChild(el("label", null, "Motyw kolorystyczny"));
    const swatchRow = el("div", { class: "wkf-row" });
    Object.entries(MOTYWY).forEach(([klucz, m]) => {
      const sw = el("span", {
        class: "wkf-swatch" + (ustawienia.motyw === klucz ? " active" : ""),
        title: m.nazwa,
        style: "background:" + m.akcent + ";",
      });
      sw.addEventListener("click", () => {
        ustawienia.motyw = klucz;
        zastosujMotyw();
        zapiszUstawienia();
        swatchRow.querySelectorAll(".wkf-swatch").forEach(s => s.classList.remove("active"));
        sw.classList.add("active");
      });
      swatchRow.appendChild(sw);
    });
    wygladPanel.appendChild(swatchRow);

    wygladPanel.appendChild(el("label", { style: "margin-top:14px;" }, "Tryb"));
    const trybSeg = el("div", { class: "wkf-segmented" });
    [["jasny", "☀️ Jasny"], ["ciemny", "🌙 Ciemny"], ["systemowy", "💻 Systemowy"]].forEach(([klucz, etykieta]) => {
      const b = el("button", { type: "button", class: ustawienia.tryb === klucz ? "active" : "" }, etykieta);
      b.addEventListener("click", () => {
        ustawienia.tryb = klucz;
        zastosujMotyw();
        zapiszUstawienia();
        trybSeg.querySelectorAll("button").forEach(x => x.classList.remove("active"));
        b.classList.add("active");
      });
      trybSeg.appendChild(b);
    });
    wygladPanel.appendChild(trybSeg);
    wygladPanel.appendChild(el("div", { class: "wkf-hint" },
      "\"Systemowy\" = tak jak jasny/ciemny motyw w Twoim systemie (jak w Windows) — przełącza się automatycznie."));

    wygladPanel.appendChild(el("label", { style: "margin-top:14px;" }, "Skala interfejsu"));
    const sliderRow = el("div", { class: "wkf-slider-row" });
    const slider = el("input", { type: "range", class: "wkf-slider", min: "0.8", max: "1.4", step: "0.05" });
    slider.value = String(ustawienia.skala);
    const sliderVal = el("span", { class: "wkf-slider-val" }, Math.round(ustawienia.skala * 100) + "%");
    slider.addEventListener("input", () => {
      ustawienia.skala = parseFloat(slider.value);
      sliderVal.textContent = Math.round(ustawienia.skala * 100) + "%";
      zastosujMotyw();
    });
    slider.addEventListener("change", () => { zapiszUstawienia(); }); // zapis dopiero po puszczeniu suwaka, nie przy każdym pikselu
    sliderRow.appendChild(slider);
    wygladPanel.appendChild(sliderRow);
    wygladPanel.appendChild(el("div", { style: "text-align:right; margin-top:-6px;" }, "")).appendChild(sliderVal);

    wygladPanel.appendChild(el("label", { style: "margin-top:14px;" }, "Pozycja okienka"));
    const pozycjaRow = el("div", { class: "wkf-row" });
    const lockBtn = el("button", { class: "wkf-btn ghost", type: "button" },
      ustawienia.zablokowane ? "🔒 Zablokowane — kliknij, aby odblokować" : "🔓 Odblokowane — kliknij, aby zablokować");
    lockBtn.addEventListener("click", () => {
      ustawienia.zablokowane = !ustawienia.zablokowane;
      zapiszUstawienia();
      lockBtn.textContent = ustawienia.zablokowane ? "🔒 Zablokowane — kliknij, aby odblokować" : "🔓 Odblokowane — kliknij, aby zablokować";
      aktualizujKursoryPrzeciagania();
    });
    pozycjaRow.appendChild(lockBtn);
    const resetPozBtn = el("button", { class: "wkf-btn ghost", type: "button" }, "↺ Reset pozycji");
    resetPozBtn.addEventListener("click", () => {
      gmZapisz("wkf_pozycja_fab", "");
      gmZapisz("wkf_pozycja_panel", "");
      fab.style.left = ""; fab.style.bottom = ""; fab.style.right = "18px"; fab.style.top = "18px";
      panel.style.left = ""; panel.style.bottom = ""; panel.style.right = "18px"; panel.style.top = "78px";
    });
    pozycjaRow.appendChild(resetPozBtn);
    wygladPanel.appendChild(pozycjaRow);
    wygladPanel.appendChild(el("div", { class: "wkf-hint" },
      "Gdy odblokowane: przeciągnij okienko za nagłówek (albo pływającą ikonkę 📋) w dowolne miejsce ekranu."));
    settingsContent.appendChild(wygladPanel);

    // ===== Podzakładka: Zachowanie (podpis + automatyzacje) =====
    const zachowaniePanel = el("div", { style: "display:none;" });

    zachowaniePanel.appendChild(el("label", null, "Podpis (zapamiętywany)"));
    const sygInput = el("input", { placeholder: "np. MJU → [MJU]", autocomplete: "off", name: "wkf-sygnatura" });
    sygInput.value = gmOdczytaj(SYG_KEY) || "";
    sygInput.addEventListener("input", () => {
      gmZapisz(SYG_KEY, sygInput.value.trim());
      renderCards();
    });
    zachowaniePanel.appendChild(sygInput);

    zachowaniePanel.appendChild(el("label", { style: "margin-top:14px;" }, "Auto-przełączanie kart"));
    const zachowanieRow = el("div", { class: "wkf-row" });
    const autoPrzelaczBtn = el("button", { class: "wkf-btn ghost", type: "button" },
      ustawienia.autoPrzelaczanie ? "🔀 WŁĄCZONE" : "🔀 wyłączone");
    autoPrzelaczBtn.addEventListener("click", () => {
      ustawienia.autoPrzelaczanie = !ustawienia.autoPrzelaczanie;
      zapiszUstawienia();
      autoPrzelaczBtn.textContent = ustawienia.autoPrzelaczanie ? "🔀 WŁĄCZONE" : "🔀 wyłączone";
    });
    zachowanieRow.appendChild(autoPrzelaczBtn);
    zachowaniePanel.appendChild(zachowanieRow);
    zachowaniePanel.appendChild(el("div", { class: "wkf-hint" },
      "Gdy włączone: \"Cały proces\" / \"Załóż konto PG\" / \"Załóż skrzynkę Home\" przełączają BIEŻĄCĄ kartę zamiast otwierać nowe. Po zakończeniu tworzenia LUB edycji konta skrypt sam wraca do tego samego wniosku na emplo."));

    zachowaniePanel.appendChild(el("label", { style: "margin-top:14px;" }, "Auto-komentarz w emplo"));
    const zachowanieRow2 = el("div", { class: "wkf-row" });
    const autoZakonczBtn = el("button", { class: "wkf-btn ghost", type: "button" },
      ustawienia.autoZakonczenie ? "💬 WŁĄCZONY" : "💬 wyłączony");
    autoZakonczBtn.addEventListener("click", () => {
      ustawienia.autoZakonczenie = !ustawienia.autoZakonczenie;
      zapiszUstawienia();
      autoZakonczBtn.textContent = ustawienia.autoZakonczenie ? "💬 WŁĄCZONY" : "💬 wyłączony";
    });
    zachowanieRow2.appendChild(autoZakonczBtn);
    zachowaniePanel.appendChild(zachowanieRow2);
    zachowaniePanel.appendChild(el("div", { class: "wkf-hint" },
      "Wymaga włączonego Auto-przełączania. Po powrocie do wniosku emplo skrypt sam wklei gotową wklejkę w pole komentarza — bez klikania czegokolwiek ręcznie."));
    settingsContent.appendChild(zachowaniePanel);

    // ===== Podzakładka: Hasła =====
    const haslaPanel = el("div", { style: "display:none;" });

    function poleUstawien(labelTxt, klucz, typ) {
      const wrap = el("div", { style: "margin-top:6px;" });
      wrap.appendChild(el("label", null, labelTxt));
      const input = el("input", { type: typ || "text", autocomplete: typ === "password" ? "new-password" : "off", name: "wkf-ust-" + Math.random().toString(36).slice(2) });
      input.value = ustawienia[klucz] || "";
      input.addEventListener("input", () => { ustawienia[klucz] = input.value; });
      wrap.appendChild(input);
      return wrap;
    }
    haslaPanel.appendChild(el("label", { style: "margin-top:14px;" }, "Logowanie do panelu Home"));
    haslaPanel.appendChild(poleUstawien("Login (Twoje własne konto Home)", "homeLogin"));
    haslaPanel.appendChild(poleUstawien("Hasło (Twoje własne konto Home)", "homeHaslo", "password"));

    haslaPanel.appendChild(el("label", { style: "margin-top:14px;" }, "Logowanie do panelu Perfect Gym"));
    haslaPanel.appendChild(poleUstawien("Login (Twoje własne konto PG)", "pgLogin"));
    haslaPanel.appendChild(poleUstawien("Hasło (Twoje własne konto PG)", "pgHaslo", "password"));

    const zapiszHaslaBtn = el("button", { class: "wkf-btn", type: "button", style: "width:100%; margin-top:14px;" }, "💾 Zapisz hasła");
    zapiszHaslaBtn.addEventListener("click", () => {
      zapiszUstawienia();
      zapiszHaslaBtn.textContent = "Zapisano ✓";
      setTimeout(() => { zapiszHaslaBtn.textContent = "💾 Zapisz hasła"; }, 1500);
    });
    haslaPanel.appendChild(zapiszHaslaBtn);
    settingsContent.appendChild(haslaPanel);

    function przelaczSubZakladke(ktora) {
      wygladPanel.style.display = ktora === "wyglad" ? "block" : "none";
      zachowaniePanel.style.display = ktora === "zachowanie" ? "block" : "none";
      haslaPanel.style.display = ktora === "hasla" ? "block" : "none";
      stabWyglad.classList.toggle("active", ktora === "wyglad");
      stabZachowanie.classList.toggle("active", ktora === "zachowanie");
      stabHasla.classList.toggle("active", ktora === "hasla");
    }
    stabWyglad.addEventListener("click", () => przelaczSubZakladke("wyglad"));
    stabZachowanie.addEventListener("click", () => przelaczSubZakladke("zachowanie"));
    stabHasla.addEventListener("click", () => przelaczSubZakladke("hasla"));

    // ----- Przełączanie widoków: Dane <-> Ustawienia (zębatka / wróć) -----
    function pokazUstawienia(pokaz) {
      dataContent.style.display = pokaz ? "none" : "block";
      settingsContent.style.display = pokaz ? "block" : "none";
    }
    gearBtn.addEventListener("click", () => pokazUstawienia(true));
    wrocBtn.addEventListener("click", () => pokazUstawienia(false));

    naglowek.after(dataContent, settingsContent);

    document.body.appendChild(panel);

    return { pImie, pKlub, pId, pSuf, hasInput, selTyp: selTypRef };
  }

  let refs;
  let pelnyTekstWniosku = "";
  function zaladujZWniosku() {
    const d = czytajWniosek();
    if (d.imie) { state.imie = d.imie; refs.pImie.input.value = d.imie; }
    if (d.klub) { state.klub = d.klub; refs.pKlub.input.value = d.klub; }
    funkcjaZWniosku = d.funkcjaPG;
    pelnyTekstWniosku = liniiStrony().join("\n");
    // ID wniosku z adresu (…/CustomRequest/12345) — potrzebne, żeby po "Całym
    // procesie" (z auto-przełączaniem) wrócić dokładnie do TEGO wniosku
    const mId = location.pathname.match(/CustomRequest\/(\d+)/);
    if (mId) state.wniosekId = mId[1];
    const inst = wykryjInstancje(pelnyTekstWniosku, state.klub);
    state.instNazwa = inst ? inst.nazwa : "";
    state.instUrl = inst ? inst.url : "";
    // Identyfikacja typu konta — trzy poziomy:
    // 1) normalnie z zaznaczonej funkcji PG (jak dotychczas),
    // 2) awaryjnie z tytułu wniosku, gdy #1 zawiedzie (krótki komunikat informacyjny),
    // 3) całkowity brak — ani #1, ani #2 nic nie dały (pełny komunikat + blokada
    //    "Cały proces", bo bez wiedzy o typie nie ma co automatyzować).
    const wykryty = dopasujRole(funkcjaZWniosku);
    if (wykryty && ROLE_PG[wykryty]) {
      state.typ = wykryty;
      identyfikacjaTypu = "normalna";
    } else {
      const zTytulu = dopasujRoleZTytulu(d.tytul);
      if (zTytulu && ROLE_PG[zTytulu]) {
        state.typ = zTytulu;
        identyfikacjaTypu = "tytul";
      } else {
        identyfikacjaTypu = "brak"; // state.typ zostaje jak było — użytkownik wybierze ręcznie
      }
    }
    if (refs.selTyp) refs.selTyp.value = state.typ || "";
    pokazWszystkie = false; // po wczytaniu pokazujemy tylko dopasowaną wklejkę
    if (typeof aktualizujBanerIdentyfikacji === "function") aktualizujBanerIdentyfikacji();
    if (typeof aktualizujBanerKomentarzy === "function") aktualizujBanerKomentarzy();

    // Weryfikacja: czy funkcja wspomniana w tytule wniosku zgadza się z tą
    // zaznaczoną pod pytaniem o dostęp do PG. Sprzeczność = prawdopodobnie zły
    // wniosek — pokazujemy wyraźne ostrzeżenie (powiadomienie, bez blokowania akcji).
    const spojnosc = sprawdzSpojnoscWniosku(d.tytul, funkcjaZWniosku);
    wniosekBledny = spojnosc.ok ? null : spojnosc;
    if (typeof aktualizujBanerBledu === "function") aktualizujBanerBledu();

    zapiszStan();
    renderCards();
  }

  // Po powrocie do emplo (auto-przełączanie, koniec "Całego procesu" lub edycji):
  // albo sam wypełnia i dodaje komentarz z gotową wklejką (Auto-komentarz włączony),
  // albo pokazuje widoczny przycisk do jej skopiowania.
  async function obslugaPowrotuZWklejka() {
    const autoKom = gmOdczytaj(AUTO_KOMENTARZ_KEY);
    const autoKomTs = parseInt(gmOdczytaj(AUTO_KOMENTARZ_TS_KEY) || "0", 10);
    const pokazBtn = gmOdczytaj(POKAZ_PRZYCISK_KEY);
    const pokazBtnTs = parseInt(gmOdczytaj(POKAZ_PRZYCISK_TS_KEY) || "0", 10);
    const tekst = gmOdczytaj(POWROT_WKLEJKA_KEY);
    if (tekst) gmZapisz(POWROT_WKLEJKA_KEY, "");

    // 1) Przycisk kopiowania — ZAWSZE, jako pewniak (nawet gdy niżej spróbujemy
    // też auto-komentarza — gdyby się nie udał, przycisk i tak tu zostaje)
    if (pokazBtn && Date.now() - pokazBtnTs < 300000 && tekst && panel) {
      gmZapisz(POKAZ_PRZYCISK_KEY, "");
      gmZapisz(POKAZ_PRZYCISK_TS_KEY, "");
      const btn = el("button", { class: "wkf-btn", type: "button", style: "width:100%; margin-bottom:10px;" },
        "📋 Skopiuj wklejkę (z zakończonego procesu)");
      btn.addEventListener("click", () => kopiuj(tekst, btn, "📋 Skopiuj wklejkę (z zakończonego procesu)"));
      const naglowek = document.getElementById("wkf-naglowek");
      if (naglowek && naglowek.parentElement) naglowek.parentElement.insertBefore(btn, naglowek.nextSibling);
      else panel.insertBefore(btn, panel.firstChild);
    }

    // 2) Auto-komentarz — dodatkowa próba, niezależna od przycisku powyżej
    if (autoKom && Date.now() - autoKomTs < 300000 && tekst) {
      gmZapisz(AUTO_KOMENTARZ_KEY, "");
      gmZapisz(AUTO_KOMENTARZ_TS_KEY, "");

      const znajdzPole = () => {
        for (const doc of wszystkieDokumentyOdGory()) {
          const p = doc.querySelector("input.jsNewCommentInput");
          if (p) return p;
        }
        return null;
      };
      // Po kliknięciu w zwykły input, strona PODMIENIA go na edytor WYSIWYG
      // (contenteditable div) — tekst trzeba wpisać TAM, nie w oryginalnym polu
      const znajdzEdytor = () => {
        for (const doc of wszystkieDokumentyOdGory()) {
          const d = doc.querySelector('div.jsCommentInput[contenteditable="true"]');
          if (d) return d;
        }
        return null;
      };

      let pole = null;
      for (let i = 0; i < 30 && !pole; i++) { pole = znajdzPole(); if (!pole) await czekaj(300); }
      if (!pole) { pokazDymek("⚠ Nie znalazłem pola komentarza na wniosku — wklej wklejkę ręcznie (przycisk powyżej)."); return; }
      klikPojedynczo(pole);
      await czekaj(900); // dajemy stronie czas na podmianę pola na edytor WYSIWYG

      // Czekamy, aż pojawi się edytor WYSIWYG (podmieniony z inputu po kliknięciu)
      let edytor = null;
      for (let i = 0; i < 20 && !edytor; i++) { edytor = znajdzEdytor(); if (!edytor) await czekaj(300); }
      if (!edytor) { pokazDymek("⚠ Kliknięto pole, ale nie pojawił się edytor komentarza — wklej ręcznie (przycisk powyżej)."); return; }
      await czekaj(400); // chwila, zanim zaczniemy pisać — jak przy prawdziwym wpisywaniu

      // Wpisujemy do contenteditable — zaznaczamy jego zawartość i execCommand
      // insertText (naturalnie wstawia PRAWDZIWE złamania linii w contenteditable,
      // w odróżnieniu od zwykłego <input>)
      const doc = edytor.ownerDocument;
      edytor.focus();
      try {
        const sel = doc.getSelection ? doc.getSelection() : (doc.defaultView || window).getSelection();
        const range = doc.createRange();
        range.selectNodeContents(edytor);
        sel.removeAllRanges();
        sel.addRange(range);
      } catch (e) {}
      let udalo = false;
      try {
        udalo = doc.execCommand("insertText", false, tekst) && !!edytor.textContent.trim();
      } catch (e) {}
      if (!udalo) {
        // zapasowo — ustawiamy treść wprost i odpalamy zdarzenie "input"
        edytor.textContent = tekst;
        edytor.dispatchEvent(new Event("input", { bubbles: true }));
        udalo = !!edytor.textContent.trim();
      }
      await czekaj(400);
      if (!udalo) { pokazDymek("⚠ Nie udało się wpisać wklejki do edytora komentarza — wklej ręcznie (przycisk powyżej)."); return; }

      // Dodatkowe zdarzenia (keyup, blur+focus) — na wypadek gdyby strona sprawdzała
      // gotowość przycisku "Dodaj komentarz" na podstawie czegoś więcej niż samo
      // zdarzenie "input" wysyłane przez execCommand
      try {
        edytor.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "a" }));
        edytor.blur();
        await czekaj(150);
        edytor.focus();
      } catch (e) {}

      // Sprawdzamy, czy przycisk "Dodaj komentarz" FAKTYCZNIE się odblokował —
      // (bywa disabled="disabled", dopóki strona nie rozpozna treści w edytorze).
      // To bezpośrednio pokazuje, czy nasz sposób wpisywania tekstu w ogóle
      // "dotarł" do logiki strony, czy tylko wizualnie wygląda na wpisane.
      const znajdzPrzyciskDodaj = () => {
        for (const doc of wszystkieDokumentyOdGory()) {
          const b = doc.querySelector("button.jsCommentSaveBtn");
          if (b) return b;
        }
        return null;
      };
      let btnDodaj = null, odblokowany = false;
      for (let i = 0; i < 15 && !odblokowany; i++) {
        btnDodaj = znajdzPrzyciskDodaj();
        if (btnDodaj && !btnDodaj.disabled) { odblokowany = true; break; }
        await czekaj(300);
      }

      // UWAGA: celowo NIE klikamy tu automatycznie "Dodaj komentarz". Syntetyczne
      // (ze skryptu) kliknięcie ma zawsze isTrusted:false — strona prawdopodobnie to
      // sprawdza przy zapisie komentarza i "wiesza się" (kręcący się w nieskończoność
      // spinner) zamiast dokończyć, mimo że komentarz czasem i tak się zapisywał.
      // Prawdziwego kliknięcia z tego poziomu nie da się wywołać — tekst zostaje
      // wpisany automatycznie, a samo kliknięcie "Dodaj komentarz" zostawiamy Tobie.
      if (!btnDodaj) {
        pokazDymek("✔ Wklejka wpisana, ale nie znalazłem przycisku 'Dodaj komentarz' — kliknij ręcznie.", true);
      } else if (odblokowany) {
        pokazDymek("✔ Wklejka wpisana, przycisk 'Dodaj komentarz' aktywny — kliknij go ręcznie.", true);
      } else {
        pokazDymek("⚠ Wklejka wpisana, ale przycisk 'Dodaj komentarz' NADAL zablokowany — strona nie rozpoznała wpisanego tekstu. Dopisz ręcznie spację/znak w polu.");
      }
    }
  }

  function init() {
    // Zabezpieczenie: jeśli przycisk już istnieje w tej ramce, nie duplikuj
    if (document.getElementById("wkf-fab")) return;

    document.head.appendChild(el("style", null, css));
    zastosujMotyw();
    fab = el("button", { id: "wkf-fab", type: "button", title: "Kliknij: otwórz/zamknij. Podwójny klik: reset pozycji." }, "📋");
    fab.addEventListener("click", () => {
      if (fab._wkfPrzeciagniety) return; // to był przeciąg, nie klik — nie otwieraj/zamykaj
      panel.classList.toggle("open");
      if (panel.classList.contains("open")) zaladujZWniosku();
    });
    // Awaryjny reset: podwójny klik zawsze przywraca domyślną pozycję ikonki i panelu,
    // niezależnie od blokady/stanu przeciągania — na wypadek, gdyby coś "uciekło" poza ekran
    fab.addEventListener("dblclick", (e) => {
      e.preventDefault();
      gmZapisz("wkf_pozycja_fab", "");
      gmZapisz("wkf_pozycja_panel", "");
      fab.style.left = ""; fab.style.bottom = ""; fab.style.right = "18px"; fab.style.top = "18px";
      if (panel) { panel.style.left = ""; panel.style.bottom = ""; panel.style.right = "18px"; panel.style.top = "78px"; }
    });
    document.body.appendChild(fab);
    refs = buildPanel();

    const naglowekPanelu = document.getElementById("wkf-naglowek");
    const fabDrag = wlaczPrzeciaganie(fab, fab, "wkf_pozycja_fab", 52, 52, true, NA_HOME);
    // Cały panel jest teraz uchwytem do przeciągania (nie tylko nagłówek) — przyciski,
    // pola i linki wewnątrz nadal działają normalnie (wykluczenie interaktywnych
    // elementów jest już wbudowane w wlaczPrzeciaganie), więc chwytasz gdziekolwiek
    // indziej: puste miejsce, etykietę, tekst wklejki itd.
    const panelDrag = wlaczPrzeciaganie(panel, panel, "wkf_pozycja_panel", 420 * (ustawienia.skala || 1), window.innerHeight * 0.82, undefined, NA_HOME);
    aktualizujKursoryPrzeciagania();

    // Ikonka widoczna TYLKO gdy panel jest zminimalizowany (zamknięty) — obserwator
    // łapie każdą zmianę klasy "open" niezależnie od tego, który fragment kodu ją zmienił.
    // Przy KAŻDYM otwarciu panelu przeliczamy jego pozycję na nowo — inaczej na stronie
    // o innym rozmiarze okna (np. Home vs emplo) mogła częściowo wystawać poza ekran.
    const synchronizujWidocznoscFab = () => {
      fab.style.display = panel.classList.contains("open") ? "none" : "flex";
      if (panel.classList.contains("open") && panelDrag) {
        panelDrag.przelicz();
        // Sprawdzamy co 200ms, AŻ wymiary okna przestaną się zmieniać między kolejnymi
        // sprawdzeniami (3 razy z rzędu bez zmiany) — bardziej niezawodne niż stałe,
        // z góry ustalone opóźnienia, bo strony (szczególnie Home) stabilizują się
        // w bardzo różnym tempie.
        let ostW = window.innerWidth, ostH = window.innerHeight, stabilnychPodRzad = 0, proby = 0;
        const stabilizujInterval = setInterval(() => {
          panelDrag.przelicz();
          proby++;
          if (window.innerWidth === ostW && window.innerHeight === ostH) {
            stabilnychPodRzad++;
            if (stabilnychPodRzad >= 3) { clearInterval(stabilizujInterval); return; }
          } else {
            stabilnychPodRzad = 0;
            ostW = window.innerWidth; ostH = window.innerHeight;
          }
          if (proby >= 25) clearInterval(stabilizujInterval); // bezpiecznik: max ~5s
        }, 200);
      }
    };
    new MutationObserver(synchronizujWidocznoscFab).observe(panel, { attributes: true, attributeFilter: ["class"] });
    synchronizujWidocznoscFab();
    window.addEventListener("resize", () => {
      if (panelDrag) panelDrag.przelicz();
      fabDrag.przelicz();
    });

    if (ODBIORCA) {
      // na home.pl / w PG nie ma wniosku — pokazujemy dane przeniesione z emplo
      panel.classList.add("open");
      renderCards();

      // Auto-synchronizacja: dane odświeżają się same, bez klikania
      let ostatniTs = 0;
      try { ostatniTs = (JSON.parse(gmOdczytaj(STAN_KEY) || "{}").ts) || 0; } catch (e) {}

      const odswiezZPamieci = (wymus) => {
        // nie nadpisuj tylko wtedy, gdy właśnie PISZESZ w polu panelu
        // (kliknięty przycisk nie blokuje — to naprawiało "gubienie" synchronizacji)
        const akt = document.activeElement;
        const pisze = akt && panel.contains(akt) && (akt.tagName === "INPUT" || akt.tagName === "TEXTAREA");
        if (!wymus && pisze) return;
        let nowyTs = 0;
        try { nowyTs = (JSON.parse(gmOdczytaj(STAN_KEY) || "{}").ts) || 0; } catch (e) {}
        if (!wymus && nowyTs === ostatniTs) return; // nic nowego
        ostatniTs = nowyTs;
        wczytajStan();
        refs.pImie.input.value = state.imie;
        refs.pKlub.input.value = state.klub;
        refs.pId.input.value = state.id;
        refs.pSuf.input.value = state.sufiks;
        if (refs.hasInput) refs.hasInput.value = state.haslo;
        renderCards();
      };
      // 1) przy każdym powrocie do tej karty (skakanie między zakładkami)
      window.addEventListener("focus", () => odswiezZPamieci(false));
      document.addEventListener("visibilitychange", () => {
        if (!document.hidden) odswiezZPamieci(false);
      });
      // 2) na żywo, gdy emplo zapisze nowe dane (jeśli przeglądarka wspiera)
      try {
        GM_addValueChangeListener(STAN_KEY, () => odswiezZPamieci(false));
      } catch (e) {}
      // 3) siatka bezpieczeństwa: cykliczne sprawdzanie co 1,5 s
      setInterval(() => odswiezZPamieci(false), 1500);
    } else {
      wczytajStan(); // podciągnij ewentualne wcześniej zapisane ID (np. z poprzedniego dodawania konta w PG)
      refs.pId.input.value = state.id;
      refs.pSuf.input.value = state.sufiks;
      panel.classList.add("open");
      zaladujZWniosku();
      obslugaPowrotuZWklejka();

      // Dociąganie ID z innej karty (np. po zakończeniu wypełniania formularza w Perfect Gym) —
      // nie ruszamy pól, gdy użytkownik właśnie w nich pisze
      const odswiezId = () => {
        const akt = document.activeElement;
        const pisze = akt && panel.contains(akt) && (akt.tagName === "INPUT" || akt.tagName === "TEXTAREA");
        if (pisze) return;
        let d;
        try { d = JSON.parse(gmOdczytaj(STAN_KEY) || "{}"); } catch (e) { d = {}; }
        let cosSieZmienilo = false;
        if (d.id && d.id !== state.id) {
          state.id = d.id;
          refs.pId.input.value = d.id;
          cosSieZmienilo = true;
        }
        if (d.haslo && d.haslo !== state.haslo) {
          state.haslo = d.haslo;
          if (refs.hasInput) refs.hasInput.value = d.haslo;
          cosSieZmienilo = true;
        }
        if (cosSieZmienilo) renderCards();
      };
      try { GM_addValueChangeListener(STAN_KEY, odswiezId); } catch (e) {}
      setInterval(odswiezId, 1500);

      // Przy kilku kartach emplo: ta, na którą patrzysz, staje się "ostatnią".
      // Puls: widoczna karta zapisuje swój stan co 1,5 s — bez klikania,
      // niezależnie od zdarzeń przeglądarki
      const oznaczJakoAktualna = () => { if (!document.hidden) zapiszStan(); };
      window.addEventListener("focus", oznaczJakoAktualna);
      document.addEventListener("visibilitychange", oznaczJakoAktualna);
      setInterval(oznaczJakoAktualna, 1500);
    }
  }

  // Sesja na Home czasem wygasa — zamiast trafić od razu na zarządzanie skrzynkami,
  // ląduje się na ekranie logowania (panel.home.pl). Logujemy się TYLKO wtedy, gdy to
  // część zaplanowanego działania (aktywna flaga AUTO_HOME) — nie robimy tego przy
  // zwykłym, ręcznym wejściu na tę stronę.
  // Lekkie powiadomienie widoczne wprost na stronie — używane na stronach logowania,
  // gdzie NIE budujemy całego panelu (i całego jego CSS), więc potrzebny jest coś
  // prostszego niż statusEl, żeby po cichu nie gubić informacji o tym, co poszło nie tak
  function pokazDymek(tekst, sukces) {
    const d = document.createElement("div");
    d.textContent = tekst;
    d.style.cssText = "position:fixed;right:18px;bottom:18px;z-index:2147483647;max-width:340px;" +
      "background:" + (sukces ? "#0f6f5c" : "#b3261e") + ";color:#fff;padding:11px 15px;border-radius:10px;" +
      "font:600 13px/1.4 system-ui,sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.35);";
    document.body.appendChild(d);
    setTimeout(() => d.remove(), 9000);
  }

  async function obslugaLoginuHome() {
    // Jeśli dopiero co kliknęliśmy "Zaloguj się" (strona bywa, że jeszcze przez
    // chwilę pokazuje ten sam formularz, zanim faktycznie przejdzie dalej) —
    // czekamy resztę odstępu zamiast od razu próbować logować się ponownie,
    // co wcześniej powodowało kilkukrotne, niepotrzebne powtórki logowania.
    const KLUCZ_OSTATNIEJ_PROBY = "wkf_home_login_ts";
    const ODSTEP_MS = 10000;
    const ostatniaProba = parseInt(gmOdczytaj(KLUCZ_OSTATNIEJ_PROBY) || "0", 10);
    if (ostatniaProba && Date.now() - ostatniaProba < ODSTEP_MS) {
      await czekaj(ODSTEP_MS - (Date.now() - ostatniaProba));
      // Opuściliśmy stronę logowania — WYMUSZAMY przejście na stronę tworzenia
      // skrzynek, zamiast liczyć na to, że przekierowanie samo tam zaprowadzi
      // (Home bywa wolne / potrafi "utknąć" na stronie pośredniej)
      if (location.hostname !== "panel.home.pl") { location.href = HOME_URL; return; }
    }

    const haslo = ustawienia.homeHaslo;
    if (!haslo) { pokazDymek("⚠ Brak zapisanego hasła do Home w Ustawieniach (zakładka Hasła) — zaloguj się ręcznie."); return; }

    // Home.pl potrafi wykryć zbyt szybkie, "botowe" logowanie i je zablokować —
    // dajemy więc więcej czasu i bardziej "ludzkie" tempo między krokami.
    await czekaj(2200);

    let pole = null;
    for (let i = 0; i < 30 && !pole; i++) {
      pole = document.querySelector('input[name="password"]');
      if (!pole) await czekaj(300);
    }
    if (!pole) { pokazDymek("⚠ Nie znalazłem pola hasła na stronie logowania Home."); return; }
    ustawWartoscDojo(pole, ""); // czyścimy ewentualną starą/zapamiętaną wartość
    await czekaj(400);
    ustawWartoscDojo(pole, haslo);
    await czekaj(900); // pauza przed kliknięciem — jak przy prawdziwym wpisywaniu

    // Szuka przycisku logowania — normalnego "Zaloguj się" ALBO "Spróbuj ponownie"
    // (Home.pl podmienia tekst na ten drugi, gdy wcześniejsza próba została
    // zablokowana ze względów bezpieczeństwa jako zbyt szybka/botowa)
    function znajdzPrzyciskHome() {
      return [...document.querySelectorAll("button")]
        .find(b => { const t = b.textContent.trim(); return t === "Zaloguj się" || t === "Spróbuj ponownie"; });
    }

    let btn = null;
    for (let i = 0; i < 20 && !btn; i++) {
      btn = znajdzPrzyciskHome();
      if (!btn) await czekaj(300);
    }
    if (!btn) { pokazDymek("⚠ Nie znalazłem przycisku logowania na Home."); return; }
    klikPojedynczo(btn);
    gmZapisz(KLUCZ_OSTATNIEJ_PROBY, String(Date.now()));
    pokazDymek("✔ Loguję do Home...", true);

    // Czekamy DŁUGO (Home bywa wolne) zamiast od razu próbować ponownie —
    // to wcześniej powodowało logowanie po kilka razy z rzędu.
    await czekaj(7000);
    if (location.hostname !== "panel.home.pl") { location.href = HOME_URL; return; }

    // Wciąż na stronie logowania — TYLKO JEDNO ponowienie, nie więcej
    // (częste ponawianie tylko pogłębiało blokadę bezpieczeństwa)
    const btnPonow = znajdzPrzyciskHome();
    if (btnPonow) {
      klikPojedynczo(btnPonow);
      gmZapisz(KLUCZ_OSTATNIEJ_PROBY, String(Date.now()));
      pokazDymek("↻ Ponawiam logowanie do Home (ostatnia próba)...", true);
      await czekaj(9000);
    }
    // Niezależnie od wyniku — jeśli w końcu zeszliśmy ze strony logowania,
    // wymuszamy przejście na stronę tworzenia skrzynek
    if (location.hostname !== "panel.home.pl") { location.href = HOME_URL; }
  }

  // Strona pośrednia po zalogowaniu (np. dashboard) — przechodzimy dalej wprost
  // do zarządzania skrzynkami. Robimy to zawsze — to bezpieczny, jednokierunkowy
  // "skrót", nie wymaga żadnej specjalnej flagi.
  function obslugaStronyPosredniejHome() {
    // Dłuższy odstęp — sesja po zalogowaniu bywa potrzebuje chwili, żeby się w pełni
    // ustabilizować; zbyt szybkie wymuszenie przejścia na stronę skrzynek potrafiło
    // odbić z powrotem do logowania (cykl logowanie -> tu -> znów logowanie...)
    setTimeout(() => { location.href = HOME_URL; }, 3000);
  }

  // Strona logowania PG (.../Pgm/#/Login) — logujemy się, gdy mamy zapisane dane
  // logowania w Ustawieniach. Po zalogowaniu appka PG sama przekierowuje dalej
  // (własna logika baf:location-go) — nie musimy nic więcej robić, istniejący
  // mechanizm wznowienia na docelowej stronie PG przejmie od tego miejsca.
  // Szuka przycisku "Zaloguj" — tekst bywa bezpośrednio wewnątrz customowego
  // elementu <baf:button>, którego zwykłe span/div/button/a nie obejmują
  function znajdzPrzyciskZalogujPG() {
    for (const doc of wszystkieDokumenty()) {
      const kandydaci = [...doc.querySelectorAll("span, div, button, a, baf\\:button")];
      const e = kandydaci.find(x => maRozmiar(x) && x.textContent.trim() === "Zaloguj" &&
        ![...x.children].some(ch => ch.textContent.trim() === "Zaloguj"));
      if (e) return e;
    }
    return null;
  }
  async function czekajNaPrzyciskZalogujPG(maxMs) {
    const kroki = Math.ceil((maxMs || 8000) / 300);
    for (let i = 0; i < kroki; i++) {
      const e = znajdzPrzyciskZalogujPG();
      if (e) return e;
      await czekaj(300);
    }
    return null;
  }

  async function obslugaLoginuPG() {
    const login = ustawienia.pgLogin, haslo = ustawienia.pgHaslo;
    if (!haslo) { pokazDymek("⚠ Brak zapisanego hasła do PG w Ustawieniach (zakładka Hasła) — zaloguj się ręcznie."); return; }

    await czekaj(1000); // sekunda na "rozruch" strony, zanim zaczniemy cokolwiek klikać/wpisywać

    // PG czasem "pamięta" użytkownika i zamiast pola loginu pokazuje jego imię
    // i nazwisko (div.user-name) — wtedy trzeba najpierw w nie kliknąć, dopiero
    // wtedy pojawia się samo pole hasła (bez loginu, bo już jest wybrany)
    let userName = null;
    for (let i = 0; i < 10 && !userName; i++) {
      userName = document.querySelector(".user-name");
      if (!userName) await czekaj(200);
    }
    const zapamietanyUzytkownik = !!(userName && maRozmiar(userName));

    if (zapamietanyUzytkownik) {
      klikPojedynczo(userName);
      await czekaj(500);
    } else {
      if (!login) { pokazDymek("⚠ Brak zapisanego loginu do PG w Ustawieniach (zakładka Hasła) — zaloguj się ręcznie."); return; }
      let poleLogin = null;
      for (let i = 0; i < 30 && !poleLogin; i++) {
        poleLogin = document.querySelector('input[name="Login"]');
        if (!poleLogin) await czekaj(300);
      }
      if (!poleLogin) { pokazDymek("⚠ Nie znalazłem pola loginu na stronie logowania PG."); return; }
      ustawWartoscDojo(poleLogin, login);
      await czekaj(200);
    }

    let polePass = null;
    for (let i = 0; i < 30 && !polePass; i++) {
      polePass = document.querySelector('input[name="Password"]');
      if (!polePass) await czekaj(300);
    }
    if (!polePass) { pokazDymek("⚠ Nie znalazłem pola hasła na stronie logowania PG."); return; }
    ustawWartoscDojo(polePass, ""); // czyścimy ewentualną starą/zapamiętaną wartość
    await czekaj(150);
    ustawWartoscDojo(polePass, haslo);
    await czekaj(300);

    const btn = await czekajNaPrzyciskZalogujPG(8000);
    if (!btn) { pokazDymek("⚠ Nie znalazłem przycisku 'Zaloguj' na stronie logowania PG."); return; }
    klikRealistycznie(btn);
    pokazDymek("✔ Loguję do PG...", true);

    // Jeśli po kilku sekundach nadal jesteśmy na stronie logowania — ponawiamy klik
    // (do 3 razy), zamiast zostawić to zawieszone
    for (let proba = 0; proba < 3; proba++) {
      await czekaj(4000);
      if (!location.hash.toLowerCase().includes("/login")) return; // sukces — trasa już inna
      const btnPonow = await czekajNaPrzyciskZalogujPG(2000);
      if (btnPonow) {
        klikRealistycznie(btnPonow);
        pokazDymek("↻ Ponawiam logowanie do PG...", true);
      }
    }
  }

  // Skrypt odpala się w każdej ramce, ale UI budujemy tylko tam,
  // gdzie naprawdę jest treść wniosku (etykieta PG na stronie).
  function czekajNaWniosek() {
    let proby = 0;
    const timer = setInterval(() => {
      proby++;
      if (toWniosekPG()) {
        clearInterval(timer);
        init();
      } else if (proby > 40) clearInterval(timer); // ~20 s i odpuszczamy
    }, 500);
  }

  function start() {
    // Zabezpieczenie: logowanie i obsługa "specjalnych" stron Home/PG mają prawo
    // działać TYLKO w głównym oknie karty, nigdy w zagnieżdżonej ramce (niektóre
    // strony, np. cp.home.pl, mają wewnętrzne ukryte ramki do cichego sprawdzania
    // sesji; panel.home.pl odmawia wyświetlenia się w ramce, stąd komunikat
    // "Firefox nie może otworzyć tej strony", gdyby coś tam próbowało działać).
    // UWAGA: to NIE dotyczy gałęzi emplo niżej — tam skrypt celowo działa w
    // KAŻDEJ ramce, bo treść wniosku bywa w iframe.
    if (window.top === window.self) {
      if (NA_HOME_LOGIN) { obslugaLoginuHome(); return; }
      if (NA_HOME_POSREDNIA) { obslugaStronyPosredniejHome(); return; }
      if (NA_PG_LOGIN) { obslugaLoginuPG(); return; }
      if (NA_PG) {
        // Appka PG potrafi PO fakcie (bez przeładowania całej strony) przekierować
        // samą siebie na #/Login, jeśli sesja wygasła — skrypt uruchomiony raz przy
        // starcie strony by tego nie zauważył. "hashchange" nie zawsze się odpala
        // (AngularJS bywa, że zmienia trasę przez pushState, nie samo location.hash),
        // więc dodatkowo okresowo sprawdzamy trasę na wypadek, gdyby hashchange nie wystarczył.
        let ostatniaTrasaZLoginem = false;
        const sprawdzTraseLoginu = () => {
          const naLoginie = location.hash.toLowerCase().includes("/login");
          if (naLoginie && !ostatniaTrasaZLoginem) obslugaLoginuPG();
          ostatniaTrasaZLoginem = naLoginie;
        };
        window.addEventListener("hashchange", sprawdzTraseLoginu);
        setInterval(sprawdzTraseLoginu, 700);
      }
    }
    if (ODBIORCA) {
      // tylko główna ramka (panel home.pl / aplikacja PG)
      if (window.top !== window.self) return;
      wczytajStan();
      init();
    } else {
      czekajNaWniosek();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
