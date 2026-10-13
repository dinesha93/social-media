require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/social_media_app')
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection failed:', err.message));

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  bio: { type: String, default: '' },
  followers: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  following: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });
const postSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 2000 },
  likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });
const commentSchema = new mongoose.Schema({
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true, maxlength: 1000 }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);
const Post = mongoose.model('Post', postSchema);
const Comment = mongoose.model('Comment', commentSchema);

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ error: 'Please log in first.' });
  try { req.user = jwt.verify(token, process.env.JWT_SECRET || 'dev_only_change_this_secret'); next(); }
  catch { return res.status(401).json({ error: 'Invalid or expired token.' }); }
}
const safeUser = u => ({ id: u._id, name: u.name, email: u.email, bio: u.bio, followersCount: u.followers.length, followingCount: u.following.length });

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password || password.length < 8) return res.status(400).json({ error: 'Name, email and password (8+ characters) are required.' });
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ error: 'Email is already registered.' });
    const user = await User.create({ name, email, passwordHash: await bcrypt.hash(password, 12) });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'dev_only_change_this_secret', { expiresIn: '7d' });
    res.status(201).json({ token, user: safeUser(user) });
  } catch (e) { res.status(500).json({ error: 'Could not register user.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const user = await User.findOne({ email: (req.body.email || '').toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password || '', user.passwordHash))) return res.status(401).json({ error: 'Invalid email or password.' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET || 'dev_only_change_this_secret', { expiresIn: '7d' });
  res.json({ token, user: safeUser(user) });
});
app.get('/api/users/:id', async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json(safeUser(user));
});
app.get('/api/users', auth, async (req, res) => {
  const users = await User.find({ _id: { $ne: req.user.id } }).limit(100);
  res.json(users.map(safeUser));
});
app.patch('/api/profile', auth, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, { $set: { name: req.body.name, bio: req.body.bio } }, { new: true, runValidators: true });
  res.json(safeUser(user));
});
app.post('/api/users/:id/follow', auth, async (req, res) => {
  if (req.params.id === req.user.id) return res.status(400).json({ error: 'You cannot follow yourself.' });
  const target = await User.findById(req.params.id);
  const me = await User.findById(req.user.id);
  if (!target || !me) return res.status(404).json({ error: 'User not found.' });
  const isFollowing = me.following.some(id => id.equals(target._id));
  if (isFollowing) {
    me.following.pull(target._id); target.followers.pull(me._id);
  } else {
    me.following.addToSet(target._id); target.followers.addToSet(me._id);
  }
  await Promise.all([me.save(), target.save()]);
  res.json({ following: !isFollowing, user: safeUser(target) });
});
app.get('/api/posts', async (req, res) => {
  const posts = await Post.find().sort({ createdAt: -1 }).limit(100).populate('author', 'name bio');
  const ids = posts.map(p => p._id);
  const comments = await Comment.find({ post: { $in: ids } }).sort({ createdAt: 1 }).populate('author', 'name');
  res.json(posts.map(p => ({ id: p._id, text: p.text, createdAt: p.createdAt, author: p.author, likesCount: p.likes.length, comments: comments.filter(c => c.post.equals(p._id)).map(c => ({ id: c._id, text: c.text, author: c.author, createdAt: c.createdAt })) })));
});
app.post('/api/posts', auth, async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Post text is required.' });
  const post = await Post.create({ author: req.user.id, text });
  res.status(201).json(post);
});
app.post('/api/posts/:id/like', auth, async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ error: 'Post not found.' });
  const liked = post.likes.some(id => id.toString() === req.user.id);
  if (liked) post.likes.pull(req.user.id); else post.likes.addToSet(req.user.id);
  await post.save();
  res.json({ liked: !liked, likesCount: post.likes.length });
});
app.post('/api/posts/:id/comments', auth, async (req, res) => {
  const text = (req.body.text || '').trim();
  if (!text) return res.status(400).json({ error: 'Comment text is required.' });
  if (!await Post.exists({ _id: req.params.id })) return res.status(404).json({ error: 'Post not found.' });
  const comment = await Comment.create({ post: req.params.id, author: req.user.id, text });
  res.status(201).json(comment);
});
app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
const port = process.env.PORT || 5001;
app.listen(port, () => console.log(`Social app running at http://localhost:${port}`));
