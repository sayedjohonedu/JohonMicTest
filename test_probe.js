const { execFileSync } = require('child_process');

function probe(file) {
  try {
    const out = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,codec_name,r_frame_rate,sample_aspect_ratio,pix_fmt',
      '-of', 'json',
      file
    ]).toString();
    const aOut = execFileSync('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name,sample_rate,channels',
      '-of', 'json',
      file
    ]).toString();
    console.log(JSON.parse(out));
    console.log(JSON.parse(aOut));
  } catch (e) {
    console.log(e);
  }
}
probe('/Users/sayedjohon/Documents/DEV_AREA/MicTab/mictab/ui/assets/video_placeholder.mp4');
