import express from 'express';
import dotenv from 'dotenv';
import supabase from './db.js';
import methodOverride from 'method-override';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(methodOverride('_method'));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.render('index');
});

// READ - список клиентов
// app.get('/clients', async (req, res) => {
//   const { data: clients, error } = await supabase
//     .from('clients')
//     .select(`
//       *,
//       client_status:status_id (name)
//     `)
//     .order('id');
//   if (error) return res.send(error.message);
//   res.render('clients/index', { clients });
// });
// READ - список клиентов с фильтрацией и сортировкой
app.get('/clients', async (req, res) => {
  let { search, status, phone, sort_by, sort_order } = req.query;
  
  let query = supabase
    .from('clients')
    .select(`
      *,
      client_status:status_id (name)
    `);

  // Фильтрация по ФИО (like)
  if (search && search.trim() !== '') {
    query = query.ilike('full_name', `%${search.trim()}%`);
  }

  // Фильтрация по статусу
  if (status && status !== 'all') {
    query = query.eq('status_id', status);
  }

  // Фильтрация по номеру телефона (like)
  if (phone && phone.trim() !== '') {
    query = query.ilike('phone_number', `%${phone.trim()}%`);
  }

  // Сортировка
  if (sort_by) {
    // Определяем порядок сортировки
    const order = sort_order === 'desc' ? false : true;
    
    // Для связанных таблиц используем специальный синтаксис
    if (sort_by === 'status') {
      query = query.order('client_status(name)', { ascending: order });
    } else {
      query = query.order(sort_by, { ascending: order });
    }
  } else {
    // Сортировка по умолчанию
    query = query.order('id');
  }

  const { data: clients, error } = await query;
  if (error) return res.send(error.message);

  // Получаем статусы для фильтра
  const { data: statuses, error: statusError } = await supabase
    .from('client_status')
    .select('*')
    .order('id');
  if (statusError) return res.send(statusError.message);

  res.render('clients/index', { 
    clients, 
    statuses,
    filters: { search, status, phone, sort_by, sort_order }
  });
});

// CREATE - форма
app.get('/clients/new', async (req, res) => {
  // Берем статусы из таблицы client_status
  const { data: statuses, error } = await supabase
    .from('client_status')
    .select('*')
    .order('id');
  if (error) return res.send(error.message);
  res.render('clients/new', { statuses });
});

// CREATE - отправка формы
app.post('/clients', async (req, res) => {
  const { full_name, phone_number, status_id } = req.body;
  const { error } = await supabase
    .from('clients')
    .insert([{ full_name, phone_number, status_id: status_id || null }]);
  if (error) return res.send(error.message);
  res.redirect('/clients');
});

// UPDATE - форма редактирования
app.get('/clients/:id/edit', async (req, res) => {
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

  res.render('clients/edit', { client, statuses });
});

// UPDATE - отправка формы
app.put('/clients/:id', async (req, res) => {
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
app.delete('/clients/:id', async (req, res) => {
  const { id } = req.params;
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) return res.send(error.message);
  res.redirect('/clients');
});

app.listen(process.env.PORT || 3000, () => {
  console.log(`Server running on port ${process.env.PORT || 3000}`);
});
