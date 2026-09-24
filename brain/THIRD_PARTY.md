# Third-party attribution

## Model code

The measured-connectome input format, signed connection weights and uniform leaky integrate-and-fire neuron constants are adapted from the Drosophila brain model by Philip Shiu and Nico Spiller: https://github.com/philshiu/Drosophila_brain_model (MIT licence, reproduced below). The source checkout used here was commit `91bdd1e7dcf193f3e7ca5a8933497fcef63b7960`.

The 12 input neurons are the sugar-sensing gustatory neurons used in the upstream example notebook (their FlyWire root IDs are listed in `joyeb_brain/connectome.py`); here they are driven by market features instead of taste stimuli.

The model is described in: Shiu, P. K. et al. "A Drosophila computational brain model reveals sensorimotor processing." *Nature* (2024). Please cite the paper when referring to the underlying model.

## Connectome data

The neuron and connectivity data come from the FlyWire connectome of the adult *Drosophila* brain (version 630, as used by the upstream model): https://flywire.ai/. The upstream repository points to its data archive at https://doi.org/10.17617/3.CZODIW. That data is covered by FlyWire's and the archive's own terms, which anyone reproducing this work must follow; the MIT licence below covers the upstream code only.

No FlyWire data, extracted graph or trained model is committed to this repository. `prepare` builds the reduced graph locally from a checkout of the upstream project, and `runtime/graph.json` records SHA-256 hashes of the source files used.

The market input mapping, reduced graph selection, pooled features, financial readout and execution integration are experimental engineering additions. They do not reproduce whole-brain behavior or establish a biological basis for predicting prices.

## Upstream license

MIT License

Copyright (c) 2023 Philip Shiu and Nico Spiller

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
