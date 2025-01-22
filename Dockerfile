FROM node:20.17.0

# Create app directory
WORKDIR /usr/src/app

# copy package.json and yarn.lock
COPY package*.json ./
COPY yarn.lock ./

# Install app dependencies
RUN yarn install


# install nodemon globally for live restart
RUN npm install -g nodemon

# copy rest of the app
COPY . .

# Expose port
EXPOSE 5000