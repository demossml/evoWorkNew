// Для обычных CSS файлов
declare module "*.css";

// Для CSS Modules
declare module "*.module.css" {
  const classes: { [key: string]: string };
  export default classes;
}

// Для SCSS/SASS файлов
declare module "*.scss";
declare module "*.sass";

// Для CSS Modules с SCSS/SASS
declare module "*.module.scss" {
  const classes: { [key: string]: string };
  export default classes;
}
declare module "*.module.sass" {
  const classes: { [key: string]: string };
  export default classes;
}

// Для любых изображений (опционально, если импортируешь картинки)
declare module "*.png";
declare module "*.jpg";
declare module "*.jpeg";
declare module "*.gif";
declare module "*.svg";
