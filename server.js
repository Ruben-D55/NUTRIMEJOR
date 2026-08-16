require('dotenv').config();
const express = require('express');
const path = require('path');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const sql = require('mssql');

const required = ['DB_SERVER','DB_NAME','DB_USER','DB_PASSWORD','JWT_SECRET'];
const missing = required.filter(k => !process.env[k]);
if (missing.length) { console.error(`Faltan variables: ${missing.join(', ')}`); process.exit(1); }

const pool = new sql.ConnectionPool({
  server: process.env.DB_SERVER,
  port: Number(process.env.DB_PORT || 1433),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  options: { encrypt: process.env.DB_ENCRYPT !== 'false', trustServerCertificate: process.env.DB_TRUST_CERTIFICATE === 'true' },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
});
const poolReady = pool.connect();
const app = express();
const prod = process.env.NODE_ENV === 'production';
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use('/api/auth', rateLimit({ windowMs: 15*60*1000, limit: 30, standardHeaders: true, legacyHeaders: false }));

const clean = value => typeof value === 'string' ? value.trim() : value;
const tokenFor = u => jwt.sign({ id:u.IdUsuario, rol:u.Rol, nombre:u.Nombre }, process.env.JWT_SECRET, { expiresIn:'8h', issuer:'nutrimejor' });
const cookieOptions = { httpOnly:true, secure:prod, sameSite:'lax', maxAge:8*60*60*1000, path:'/' };
function auth(req,res,next){ try { req.user=jwt.verify(req.cookies.nutrimejor_token,process.env.JWT_SECRET,{issuer:'nutrimejor'}); next(); } catch { res.status(401).json({error:'Sesión inválida o vencida.'}); } }
function admin(req,res,next){ return req.user.rol==='ADMIN'?next():res.status(403).json({error:'Acceso exclusivo para administradores.'}); }
function ownerFilter(req){ return req.user.rol==='ADMIN' ? '' : ' AND IdNutricionista = @userId'; }

app.post('/api/auth/register', async(req,res,next)=>{ try{
  const nombre=clean(req.body.nombre), email=clean(req.body.email)?.toLowerCase(), password=req.body.password;
  if(!nombre||!email||!/^\S+@\S+\.\S+$/.test(email)||typeof password!=='string'||password.length<8) return res.status(400).json({error:'Completa los datos. La contraseña debe tener al menos 8 caracteres.'});
  const db=await poolReady; const exists=await db.request().input('email',sql.NVarChar(180),email).query('SELECT 1 AS Existe FROM Usuarios WHERE Email=@email');
  if(exists.recordset.length) return res.status(409).json({error:'El correo ya está registrado.'});
  const hash=await bcrypt.hash(password,12);
  const result=await db.request().input('nombre',sql.NVarChar(120),nombre).input('email',sql.NVarChar(180),email).input('hash',sql.NVarChar(255),hash).query("INSERT INTO Usuarios(Nombre,Email,PasswordHash,Rol) OUTPUT INSERTED.IdUsuario,INSERTED.Nombre,INSERTED.Email,INSERTED.Rol VALUES(@nombre,@email,@hash,'NUTRICIONISTA')");
  const u=result.recordset[0]; res.cookie('nutrimejor_token',tokenFor(u),cookieOptions).status(201).json({usuario:{id:u.IdUsuario,nombre:u.Nombre,email:u.Email,rol:u.Rol}});
}catch(e){next(e)}});
app.post('/api/auth/login', async(req,res,next)=>{ try{
  const email=clean(req.body.email)?.toLowerCase(), password=req.body.password||''; const db=await poolReady;
  const result=await db.request().input('email',sql.NVarChar(180),email).query('SELECT TOP 1 IdUsuario,Nombre,Email,PasswordHash,Rol,Activo FROM Usuarios WHERE Email=@email'); const u=result.recordset[0];
  if(!u||!u.Activo||!(await bcrypt.compare(password,u.PasswordHash))) return res.status(401).json({error:'Correo o contraseña incorrectos.'});
  res.cookie('nutrimejor_token',tokenFor(u),cookieOptions).json({usuario:{id:u.IdUsuario,nombre:u.Nombre,email:u.Email,rol:u.Rol}});
}catch(e){next(e)}});
app.post('/api/auth/logout',(req,res)=>{res.clearCookie('nutrimejor_token',{path:'/'}).status(204).end()});
app.get('/api/auth/me',auth,async(req,res,next)=>{try{const db=await poolReady;const r=await db.request().input('id',sql.Int,req.user.id).query('SELECT IdUsuario AS id,Nombre AS nombre,Email AS email,Rol AS rol,Matricula AS matricula,Especialidad AS especialidad FROM Usuarios WHERE IdUsuario=@id AND Activo=1');if(!r.recordset[0])return res.status(401).json({error:'Usuario no disponible.'});res.json({usuario:r.recordset[0]})}catch(e){next(e)}});

app.get('/api/dashboard',auth,async(req,res,next)=>{try{const db=await poolReady;const own=req.user.rol==='ADMIN'?'':' WHERE IdNutricionista=@id';const request=db.request().input('id',sql.Int,req.user.id);const [p,a,r,d]=await Promise.all([request.query(`SELECT COUNT(*) total FROM Pacientes${own}${own?' AND':' WHERE'} Estado='ACTIVO'`),db.request().input('id',sql.Int,req.user.id).query(`SELECT COUNT(*) total FROM Alimentos${own}`),db.request().input('id',sql.Int,req.user.id).query(`SELECT COUNT(*) total FROM Recetas${own}`),db.request().input('id',sql.Int,req.user.id).query(`SELECT COUNT(*) total FROM Dietas${own}`)]);res.json({pacientes:p.recordset[0].total,alimentos:a.recordset[0].total,recetas:r.recordset[0].total,dietas:d.recordset[0].total})}catch(e){next(e)}});

app.get('/api/pacientes',auth,async(req,res,next)=>{try{const db=await poolReady;const q=clean(req.query.q)||'';const r=await db.request().input('userId',sql.Int,req.user.id).input('q',sql.NVarChar(200),`%${q}%`).query(`SELECT IdPaciente id,Nombres nombres,Apellidos apellidos,Documento documento,FechaNacimiento fechaNacimiento,Sexo sexo,Telefono telefono,Email email,Objetivo objetivo,Peso peso,Altura altura,Estado estado FROM Pacientes WHERE (Nombres LIKE @q OR Apellidos LIKE @q OR Documento LIKE @q)${ownerFilter(req)} ORDER BY FechaActualizacion DESC`);res.json(r.recordset)}catch(e){next(e)}});
app.post('/api/pacientes',auth,async(req,res,next)=>{try{const b=req.body;if(!clean(b.nombres)||!clean(b.apellidos))return res.status(400).json({error:'Nombre y apellido son obligatorios.'});const db=await poolReady;const r=await db.request().input('u',sql.Int,req.user.id).input('n',sql.NVarChar(100),clean(b.nombres)).input('a',sql.NVarChar(100),clean(b.apellidos)).input('doc',sql.NVarChar(30),clean(b.documento)||null).input('fn',sql.Date,b.fechaNacimiento||null).input('s',sql.VarChar(20),b.sexo||null).input('t',sql.NVarChar(30),clean(b.telefono)||null).input('e',sql.NVarChar(180),clean(b.email)||null).input('o',sql.NVarChar(300),clean(b.objetivo)||null).input('p',sql.Decimal(6,2),b.peso||null).input('al',sql.Decimal(5,2),b.altura||null).query('INSERT INTO Pacientes(IdNutricionista,Nombres,Apellidos,Documento,FechaNacimiento,Sexo,Telefono,Email,Objetivo,Peso,Altura) OUTPUT INSERTED.IdPaciente id VALUES(@u,@n,@a,@doc,@fn,@s,@t,@e,@o,@p,@al)');res.status(201).json(r.recordset[0])}catch(e){next(e)}});
app.put('/api/pacientes/:id',auth,async(req,res,next)=>{try{const b=req.body,db=await poolReady;const r=await db.request().input('id',sql.Int,req.params.id).input('userId',sql.Int,req.user.id).input('n',sql.NVarChar(100),clean(b.nombres)).input('a',sql.NVarChar(100),clean(b.apellidos)).input('doc',sql.NVarChar(30),clean(b.documento)||null).input('fn',sql.Date,b.fechaNacimiento||null).input('s',sql.VarChar(20),b.sexo||null).input('t',sql.NVarChar(30),clean(b.telefono)||null).input('e',sql.NVarChar(180),clean(b.email)||null).input('o',sql.NVarChar(300),clean(b.objetivo)||null).input('p',sql.Decimal(6,2),b.peso||null).input('al',sql.Decimal(5,2),b.altura||null).input('estado',sql.VarChar(20),b.estado==='INACTIVO'?'INACTIVO':'ACTIVO').query(`UPDATE Pacientes SET Nombres=@n,Apellidos=@a,Documento=@doc,FechaNacimiento=@fn,Sexo=@s,Telefono=@t,Email=@e,Objetivo=@o,Peso=@p,Altura=@al,Estado=@estado,FechaActualizacion=SYSUTCDATETIME() WHERE IdPaciente=@id${ownerFilter(req)}; SELECT @@ROWCOUNT updated`);if(!r.recordset[0].updated)return res.status(404).json({error:'Paciente no encontrado.'});res.json({ok:true})}catch(e){next(e)}});
app.delete('/api/pacientes/:id',auth,async(req,res,next)=>{try{const db=await poolReady;const r=await db.request().input('id',sql.Int,req.params.id).input('userId',sql.Int,req.user.id).query(`UPDATE Pacientes SET Estado='INACTIVO',FechaActualizacion=SYSUTCDATETIME() WHERE IdPaciente=@id${ownerFilter(req)}; SELECT @@ROWCOUNT updated`);if(!r.recordset[0].updated)return res.status(404).json({error:'Paciente no encontrado.'});res.status(204).end()}catch(e){next(e)}});

const catalogs={alimentos:{table:'Alimentos',id:'IdAlimento',fields:{nombre:['Nombre',sql.NVarChar(150)],porcionGramos:['PorcionGramos',sql.Decimal(7,2)],calorias:['Calorias',sql.Decimal(8,2)],proteinas:['Proteinas',sql.Decimal(8,2)],carbohidratos:['Carbohidratos',sql.Decimal(8,2)],grasas:['Grasas',sql.Decimal(8,2)]}},recetas:{table:'Recetas',id:'IdReceta',fields:{nombre:['Nombre',sql.NVarChar(150)],descripcion:['Descripcion',sql.NVarChar(500)],porciones:['Porciones',sql.Int],calorias:['Calorias',sql.Decimal(8,2)],ingredientes:['Ingredientes',sql.NVarChar(sql.MAX)],preparacion:['Preparacion',sql.NVarChar(sql.MAX)]}},dietas:{table:'Dietas',id:'IdDieta',fields:{nombre:['Nombre',sql.NVarChar(150)],objetivoCalorias:['ObjetivoCalorias',sql.Decimal(8,2)],descripcion:['Descripcion',sql.NVarChar(sql.MAX)],estado:['Estado',sql.VarChar(20)]}}};
app.get('/api/catalogos/:tipo',auth,async(req,res,next)=>{try{const c=catalogs[req.params.tipo];if(!c)return res.status(404).end();const db=await poolReady;const r=await db.request().input('userId',sql.Int,req.user.id).query(`SELECT * FROM ${c.table} WHERE 1=1${ownerFilter(req)} ORDER BY FechaCreacion DESC`);res.json(r.recordset)}catch(e){next(e)}});
app.post('/api/catalogos/:tipo',auth,async(req,res,next)=>{try{const c=catalogs[req.params.tipo];if(!c)return res.status(404).end();if(!clean(req.body.nombre))return res.status(400).json({error:'El nombre es obligatorio.'});const db=await poolReady,request=db.request().input('userId',sql.Int,req.user.id),cols=['IdNutricionista'],vals=['@userId'];for(const [key,[col,type]] of Object.entries(c.fields)){request.input(key,type,req.body[key]??null);cols.push(col);vals.push('@'+key)}const r=await request.query(`INSERT INTO ${c.table}(${cols.join(',')}) OUTPUT INSERTED.${c.id} id VALUES(${vals.join(',')})`);res.status(201).json(r.recordset[0])}catch(e){next(e)}});

app.get('/api/usuarios',auth,admin,async(req,res,next)=>{try{const db=await poolReady;const r=await db.request().query('SELECT IdUsuario id,Nombre nombre,Email email,Rol rol,Activo activo,FechaCreacion fechaCreacion FROM Usuarios ORDER BY FechaCreacion DESC');res.json(r.recordset)}catch(e){next(e)}});
app.patch('/api/usuarios/:id',auth,admin,async(req,res,next)=>{try{const rol=req.body.rol==='ADMIN'?'ADMIN':'NUTRICIONISTA',activo=req.body.activo?1:0;if(Number(req.params.id)===req.user.id&&!activo)return res.status(400).json({error:'No puedes desactivar tu propia cuenta.'});const db=await poolReady;await db.request().input('id',sql.Int,req.params.id).input('rol',sql.VarChar(20),rol).input('activo',sql.Bit,activo).query('UPDATE Usuarios SET Rol=@rol,Activo=@activo WHERE IdUsuario=@id');res.json({ok:true})}catch(e){next(e)}});
app.put('/api/perfil',auth,async(req,res,next)=>{try{const db=await poolReady;await db.request().input('id',sql.Int,req.user.id).input('nombre',sql.NVarChar(120),clean(req.body.nombre)).input('matricula',sql.NVarChar(80),clean(req.body.matricula)||null).input('especialidad',sql.NVarChar(120),clean(req.body.especialidad)||null).query('UPDATE Usuarios SET Nombre=@nombre,Matricula=@matricula,Especialidad=@especialidad WHERE IdUsuario=@id');res.json({ok:true})}catch(e){next(e)}});

app.use(express.static(path.join(__dirname,'public'),{maxAge:prod?'1h':0}));
app.use((req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,req,res,next)=>{console.error(err);res.status(500).json({error:prod?'Ocurrió un error interno.':err.message})});
const port=Number(process.env.PORT||3000);poolReady.then(()=>app.listen(port,()=>console.log(`NUTRIMEJOR en http://localhost:${port}`))).catch(e=>{console.error('No se pudo conectar a SQL Server:',e.message);process.exit(1)});
