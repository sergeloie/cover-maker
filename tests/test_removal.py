import io
import unittest

import numpy as np
from PIL import Image, ImageDraw

from app.models import is_downloaded
from app.removal import _mask_from_output, _prepare, decode_image, remove_background


def subject_image() -> Image.Image:
    image = Image.new("RGB", (480, 640), "white")
    draw = ImageDraw.Draw(image)
    draw.ellipse((120, 120, 360, 500), fill=(214, 64, 42))
    return image


class PreprocessTests(unittest.TestCase):
    def test_u2net_tensor_shape_and_range(self):
        tensor = _prepare(subject_image(), "u2net", 320)
        self.assertEqual(tensor.shape, (1, 3, 320, 320))
        self.assertEqual(tensor.dtype, np.float32)
        self.assertLess(float(tensor.min()), 0.0)
        self.assertGreater(float(tensor.max()), 1.0)

    def test_modnet_tensor_shape_and_range(self):
        tensor = _prepare(subject_image(), "modnet", 512)
        self.assertEqual(tensor.shape, (1, 3, 512, 512))
        self.assertAlmostEqual(float(tensor.min()), -1.0, places=3)
        self.assertLessEqual(float(tensor.max()), 1.0)

    def test_u2net_output_is_normalised(self):
        raw = np.array([[[[0.2, 0.4], [0.6, 0.8]]]], dtype=np.float32)
        mask = _mask_from_output(raw, "u2net")
        self.assertAlmostEqual(float(mask.min()), 0.0, places=5)
        self.assertAlmostEqual(float(mask.max()), 1.0, places=5)

    def test_modnet_logits_are_sigmoided(self):
        raw = np.array([[[[-2.0, 0.0], [0.0, 2.0]]]], dtype=np.float32)
        mask = _mask_from_output(raw, "modnet")
        self.assertGreaterEqual(float(mask.min()), 0.0)
        self.assertLessEqual(float(mask.max()), 1.0)
        self.assertAlmostEqual(float(mask[0, 0]), 0.1192, places=3)

    def test_decode_rejects_non_image(self):
        with self.assertRaises(ValueError):
            decode_image(b"not an image")


@unittest.skipUnless(is_downloaded("u2net"), "U2-Net weights are not downloaded")
class U2NetInferenceTests(unittest.TestCase):
    def test_background_is_removed(self):
        image = subject_image()
        png, meta = remove_background(image, "u2net", 0)
        result = Image.open(io.BytesIO(png))
        self.assertEqual(result.size, image.size)
        self.assertEqual(result.mode, "RGBA")
        alpha = np.asarray(result.getchannel("A"))
        self.assertLess(int(alpha.min()), 20)
        self.assertGreater(int(alpha.max()), 235)
        self.assertIn(meta["device"], {"CPU", "GPU (CUDA)"})
        self.assertGreater(meta["elapsedMs"], 0)


@unittest.skipUnless(is_downloaded("modnet"), "MODNet weights are not downloaded")
class ModNetInferenceTests(unittest.TestCase):
    def test_returns_rgba_at_source_size(self):
        image = subject_image()
        png, meta = remove_background(image, "modnet", 0)
        result = Image.open(io.BytesIO(png))
        self.assertEqual(result.size, image.size)
        self.assertEqual(result.mode, "RGBA")
        self.assertIn(meta["device"], {"CPU", "GPU (CUDA)"})


if __name__ == "__main__":
    unittest.main()
