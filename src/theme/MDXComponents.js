import MDXComponents from '@theme-original/MDXComponents';
import Quiz from '@site/src/components/Interactive/Quiz';
import Flashcards from '@site/src/components/Interactive/Flashcards';
import PayoffDiagram from '@site/src/components/Interactive/PayoffDiagram';
import BlackScholesLab from '@site/src/components/Interactive/BlackScholesLab';
import NormalExplorer from '@site/src/components/Interactive/NormalExplorer';
import GBMSimulator from '@site/src/components/Interactive/GBMSimulator';
import CompoundInterestLab from '@site/src/components/Interactive/CompoundInterestLab';
import PySandbox from '@site/src/components/Interactive/PySandbox';
import Notebook from '@site/src/components/Interactive/Notebook';
import CalcPlot from '@site/src/components/CalcPlot';

// Every component listed here can be used in any .mdx file without an import.
export default {
  ...MDXComponents,
  Quiz,
  Flashcards,
  PayoffDiagram,
  BlackScholesLab,
  NormalExplorer,
  GBMSimulator,
  CompoundInterestLab,
  PySandbox,
  Notebook,
  CalcPlot,
};
