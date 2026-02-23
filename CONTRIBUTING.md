# Contributing to Synapse Live Debug

Thank you for your interest in contributing! 🎉

## How to Contribute

### Reporting Bugs
1. Check if the issue already exists
2. Open a new issue with:
   - Clear title
   - Steps to reproduce
   - Expected vs actual behavior
   - Screenshots if applicable

### Suggesting Features
1. Open an issue with `[Feature]` prefix
2. Describe the use case
3. Explain how it benefits users

### Pull Requests

1. Fork the repository
2. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```
3. Make your changes
4. Test locally:
   ```bash
   cd backend
   pip install -r requirements.txt
   python main.py
   ```
5. Commit with clear message:
   ```bash
   git commit -m "feat: add new feature"
   ```
6. Push and open a PR

### Commit Message Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Formatting
- `refactor:` - Code restructure
- `test:` - Tests
- `chore:` - Maintenance

## Development Setup

```bash
# Clone
git clone https://github.com/Gabrobals/Synapse-Live-Debug.git
cd Synapse-Live-Debug

# Backend
cd backend
pip install -r requirements.txt
python main.py

# Open browser
# http://localhost:8421
```

## Code Style

- **Python**: PEP 8, type hints preferred
- **JavaScript**: ES6+, no jQuery
- **CSS**: BEM methodology

## Questions?

Open a Discussion or Issue. We're happy to help!
