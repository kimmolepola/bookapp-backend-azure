require('dotenv').config();
const {
  ApolloServer, UserInputError, AuthenticationError, gql,
} = require('apollo-server-azure-functions');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Author = require('../models/Author');
const Book = require('../models/Book');

// const pubsub = new PubSub();
const { JWT_SECRET } = process.env;

mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);

const { MONGODB_URI } = process.env;

console.log('connecting to', MONGODB_URI);

mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => {
    console.log('connected to MongoDB');
  })
  .catch((error) => {
    console.log('error connecting to MongoDB:', error.message);
  });


const typeDefs = gql`
  type Author {
    name: String!
    id: ID
    born: Int
    bookCount: Int
  }
  type Book {
    title: String!
    published: Int!
    author: Author!
    genres: [String!]
    id: ID!
  }
  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }
  type Token {
    value: String!
  }
  type Subscription {
    bookAdded: Book!
  }
  type Mutation {
    createUser(
      username: String!
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
    editAuthor(
      name: String!
      setBornTo: Int!
    ): Author
    addBook(
      title: String!
      author: String
      published: Int
      genres: [String!]
    ): Book
  }
  type Query {
    allGenres: [String!]!
    me: User
    allAuthors: [Author!]!
    allBooks(author: String, genre: String): [Book!]!
    authorCount: Int!
    bookCount: Int!
  }
`;

const resolvers = {
  Mutation: {
    createUser: (root, args) => {
      const user = new User({ username: args.username, favoriteGenre: args.favoriteGenre });

      return user.save()
        .catch((error) => {
          throw new UserInputError(error.message, { invalidArgs: args });
        });
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username });
      if (!user || args.password !== 'qwer') {
        throw new UserInputError('wrong credentials');
      }
      const userForToken = {
        username: user.username,
        id: user._id, // eslint-disable-line no-underscore-dangle
      };
      return { value: jwt.sign(userForToken, JWT_SECRET) };
    },
    editAuthor: async (root, args, { currentUser }) => {
      if (!currentUser) {
        throw new AuthenticationError('not authenticated');
      }
      const author = await Author.findOne({ name: args.name });
      author.born = args.setBornTo;
      try {
        await author.save();
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        });
      }
      return author;
    },

    addBook: async (root, args, { currentUser }) => {
      if (!currentUser) {
        throw new AuthenticationError('not authenticated');
      }
      let authorObj = await Author.findOne({ name: args.author });
      if (!authorObj) {
        authorObj = new Author({ name: args.author, bookCount: 0 });
        authorObj = await authorObj.save();
      }
      const book = new Book({ ...args, author: authorObj });
      try {
        await book.save();
      } catch (error) {
        throw new UserInputError(error.message, {
          invalidArgs: args,
        });
      }
      authorObj.bookCount += 1;
      authorObj.save();
      // pubsub.publish('BOOK_ADDED', { bookAdded: book });
      return book;
    },
  },

  /*
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterator(['BOOK_ADDED']),
    },
  },
  */

  Query: {
    allGenres: async () => Object.keys((await Book.find({})).reduce((acc, cur) => {
      cur.genres.map((x) => acc[x] = true);
      return acc;
    }, [])),
    me: (root, args, context) => context.currentUser,
    allAuthors: () => Author.find({}),
    allBooks: (root, args) => (args.genre === ''
      ? Book.find({}).populate('author')
      : Book.find({ genres: { $in: [args.genre] } }).populate('author')),
    authorCount: () => Author.collection.countDocuments(),
    bookCount: () => Book.collection.countDocuments(),
  },
};

const server = new ApolloServer({
  typeDefs,
  resolvers,
  context: async ({ request }) => {
    const auth = request ? request.headers.authorization : null;
    if (auth && auth.toLowerCase().startsWith('bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7), JWT_SECRET,
      );
      const currentUser = await User.findById(decodedToken.id);
      return { currentUser };
    }
  },
});
/*
server.listen({ port: process.env.PORT || 4000 }).then(({ url, subscriptionsUrl }) => {
  console.log(`Server ready at ${url}`);
  console.log(`Subscriptions ready at ${subscriptionsUrl}`);
});
*/

exports.graphqlHandler = server.createHandler({
  cors: {
    origin: '*',
    credentials: true,
  },
});
