import express from 'express';
import dotenv from 'dotenv';
import supabase from './db.js';
import methodOverride from 'method-override';
import path from 'path';
import { fileURLToPath } from 'url';
import session from 'express-session';
import bcrypt from 'bcrypt';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============ Настройки приложения ============
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static('public'));

// ============ Сессии ============
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'supersecretkey',
    resave: false,
    saveUninitialized: false,
  })
);

// ========================
// 🔹 Middleware для защиты маршрутов
// ========================
function requireAuth(req, res, next) {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  next();
}

// ========================
// 🔹 ГЛАВНАЯ СТРАНИЦА
// ========================
app.get('/', (req, res) => {
  res.render('index', { user: req.session.user || null });
});

// ========================
// 🔹 РЕГИСТРАЦИЯ
// ========================
app.get('/register', (req, res) => {
  res.render('register', { user: req.session.user || null });
});

app.post('/register', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    // Проверяем, есть ли уже пользователь
    const { data: existingUser } = await supabase
      .from('users')
      .select('*')
      .or(`email.eq.${email},username.eq.${username}`);

    if (existingUser && existingUser.length > 0) {
      return res.status(400).send('Пользователь с таким email или именем уже существует.');
    }

    // Хешируем пароль
    const password_hash = await bcrypt.hash(password, 10);

    // Создаём пользователя
    const { error } = await supabase.from('users').insert([
      {
        username,
        email,
        password_hash,
      },
    ]);

    if (error) throw error;

    res.redirect('/login');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при регистрации.');
  }
});

// ========================
// 🔹 ЛОГИН
// ========================
app.get('/login', (req, res) => {
  res.render('login', { user: req.session.user || null });
});

app.post('/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (error) throw error;
    if (!users || users.length === 0) {
      return res.status(400).send('Пользователь не найден.');
    }

    const user = users[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).send('Неверный пароль.');
    }

    req.session.user = { id: user.id, username: user.username, email: user.email };
    res.redirect('/');
  } catch (err) {
    console.error(err);
    res.status(500).send('Ошибка при входе.');
  }
});

// ========================
// 🔹 ВЫХОД
// ========================
app.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/');
  });
});

// ========================
// 🔹 CLIENTS CRUD (ТВОЙ КОД)
// ========================

// READ - список клиентов
app.get('/clients', requireAuth, async (req, res) => {
  let { search, status, phone, sort_by, sort_order } = req.query;

  let query = supabase
    .from('clients')
    .select(`
      *,
      client_status:status_id (name)
    `);

  if (search && search.trim() !== '') {
    query = query.ilike('full_name', `%${search.trim()}%`);
  }

  if (status && status !== 'all') {
    query = query.eq('status_id', status);
  }

  if (phone && phone.trim() !== '') {
    query = query.ilike('phone_number', `%${phone.trim()}%`);
  }

  if (sort_by) {
    const order = sort_order === 'desc' ? false : true;
    if (sort_by === 'status') {
      query = query.order('client_status(name)', { ascending: order });
    } else {
      query = query.order(sort_by, { ascending: order });
    }
  } else {
    query = query.order('id');
  }

  const { data: clients, error } = await query;
  if (error) return res.send(error.message);

  const { data: statuses, error: statusError } = await supabase
    .from('client_status')
    .select('*')
    .order('id');
  if (statusError) return res.send(statusError.message);

  res.render('clients/index', { 
    clients, 
    statuses,
    user: req.session.user || null,
    filters: { search, status, phone, sort_by, sort_order }
  });
});

// CREATE - форма
app.get('/clients/new', requireAuth, async (req, res) => {
  const { data: statuses, error } = await supabase
    .from('client_status')
    .select('*')
    .order('id');
  if (error) return res.send(error.message);
  res.render('clients/new', { statuses, user: req.session.user || null });
});

// CREATE - отправка формы
app.post('/clients', requireAuth, async (req, res) => {
  const { full_name, phone_number, status_id } = req.body;
  const { error } = await supabase
    .from('clients')
    .insert([{ full_name, phone_number, status_id: status_id || null }]);
  if (error) return res.send(error.message);
  res.redirect('/clients');
});

// UPDATE - форма
app.get('/clients/:id/edit', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { data: client, error: clientError } = await supabase
    .from('clients')
    .select('*')
    .eq('id', id)
    .single();
  if (clientError) return res.send(clientError.message);

  const { data: statuses, error: statusError } = await supabase
    .from('client_status')
    .select('*')
    .order('id');
  if (statusError) return res.send(statusError.message);

  res.render('clients/edit', { client, statuses, user: req.session.user || null });
});

// UPDATE - отправка формы
app.put('/clients/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { full_name, phone_number, status_id } = req.body;
  const { error } = await supabase
    .from('clients')
    .update({ full_name, phone_number, status_id: status_id || null })
    .eq('id', id);
  if (error) return res.send(error.message);
  res.redirect('/clients');
});

// DELETE
app.delete('/clients/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) return res.send(error.message);
  res.redirect('/clients');
});

// ========================
// 🔹 ЗАПУСК СЕРВЕРА
// ========================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
