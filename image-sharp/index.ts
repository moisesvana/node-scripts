import sharp from "sharp";

const imageMetadata = async () => {
  const metadata = await sharp("./images.jpg").metadata();

  console.log(metadata);
};

imageMetadata();
