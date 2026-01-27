import { useEffect, useRef } from 'react';
import {
  Box,
  IconButton,
  InputAdornment,
  TextField,
  Typography,
  makeStyles,
} from '@material-ui/core';
import ClearIcon from '@material-ui/icons/Clear';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import { useFluxOverviewData } from '../../../FluxOverviewDataProvider';

const MIN_SEARCH_LENGTH = 3;

const useStyles = makeStyles(theme => ({
  root: {
    paddingBottom: theme.spacing(1),
    paddingTop: theme.spacing(1),
  },
  label: {
    fontWeight: 'bold',
    fontSize: theme.typography.body2.fontSize,
    marginBottom: theme.spacing(1),
    color: theme.palette.text.primary,
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  textField: {
    flex: 1,
    '& .MuiOutlinedInput-root': {
      backgroundColor: theme.palette.background.paper,
    },
    '& [class*="MuiOutlinedInput-adornedEnd"]': {
      paddingRight: '4px !important',
    },
  },
  counter: {
    fontSize: theme.typography.body2.fontSize,
    color: theme.palette.text.secondary,
    textAlign: 'center',
    whiteSpace: 'nowrap',
    marginLeft: 3,
  },
  navigationButtons: {
    display: 'flex',
    flexDirection: 'column',
  },
  navButton: {
    padding: 0,
  },
}));

export const TreeSearch = () => {
  const classes = useStyles();
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    searchQuery,
    setSearchQuery,
    totalMatches,
    currentMatchIndex,
    navigateToNextMatch,
    navigateToPreviousMatch,
    tree,
  } = useFluxOverviewData();

  const hasMatches = totalMatches > 0;
  const showCounter = searchQuery.length >= MIN_SEARCH_LENGTH;

  // Keyboard shortcuts: Ctrl/Cmd+F to focus, Ctrl/Cmd+G for next, Ctrl/Cmd+Shift+G for previous
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        inputRef.current?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'g') {
        e.preventDefault();
        if (e.shiftKey) {
          navigateToPreviousMatch();
        } else {
          navigateToNextMatch();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [navigateToNextMatch, navigateToPreviousMatch]);

  return (
    <Box className={classes.root}>
      <Typography className={classes.label}>Search resources</Typography>
      <Box className={classes.searchContainer}>
        <TextField
          inputRef={inputRef}
          className={classes.textField}
          variant="outlined"
          size="small"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          disabled={!tree}
          InputProps={{
            endAdornment: searchQuery && (
              <InputAdornment position="end">
                <IconButton size="small" onClick={() => setSearchQuery('')}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </InputAdornment>
            ),
          }}
        />
        {showCounter && (
          <>
            <Typography className={classes.counter}>
              {hasMatches
                ? `${currentMatchIndex + 1} / ${totalMatches}`
                : '0 hits'}
            </Typography>
            <Box className={classes.navigationButtons}>
              <IconButton
                className={classes.navButton}
                size="small"
                onClick={navigateToPreviousMatch}
                disabled={!hasMatches}
                title="Previous match"
              >
                <KeyboardArrowUpIcon fontSize="small" />
              </IconButton>
              <IconButton
                className={classes.navButton}
                size="small"
                onClick={navigateToNextMatch}
                disabled={!hasMatches}
                title="Next match"
              >
                <KeyboardArrowDownIcon fontSize="small" />
              </IconButton>
            </Box>
          </>
        )}
      </Box>
    </Box>
  );
};
