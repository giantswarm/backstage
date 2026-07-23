import { useEffect, useRef } from 'react';
import { Box, ButtonIcon, Flex, SearchField, Text } from '@backstage/ui';
import KeyboardArrowUpIcon from '@material-ui/icons/KeyboardArrowUp';
import KeyboardArrowDownIcon from '@material-ui/icons/KeyboardArrowDown';
import { useFluxOverviewData } from '../../../FluxOverviewDataProvider';

const MIN_SEARCH_LENGTH = 3;

export const TreeSearch = () => {
  // The bui SearchField forwards a ref to its wrapper element, so reach the
  // inner input through it to focus on the keyboard shortcut.
  const searchFieldRef = useRef<HTMLDivElement>(null);
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
        searchFieldRef.current?.querySelector('input')?.focus();
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
    <Box pt="2" pb="2">
      <Box mb="2">
        <Text variant="body-small" weight="bold">
          Search resources
        </Text>
      </Box>
      <Flex align="center" gap="2">
        <Box grow>
          <SearchField
            ref={searchFieldRef}
            aria-label="Search resources"
            placeholder="Name or failure message"
            value={searchQuery}
            onChange={setSearchQuery}
            isDisabled={!tree}
            size="small"
          />
        </Box>
        {showCounter && (
          <>
            <Text
              variant="body-small"
              color="secondary"
              style={{ whiteSpace: 'nowrap' }}
            >
              {hasMatches
                ? `${currentMatchIndex + 1} / ${totalMatches}`
                : '0 hits'}
            </Text>
            <Flex direction="column" gap="0">
              <ButtonIcon
                icon={<KeyboardArrowUpIcon fontSize="small" />}
                aria-label="Previous match"
                variant="tertiary"
                size="small"
                onPress={navigateToPreviousMatch}
                isDisabled={!hasMatches}
              />
              <ButtonIcon
                icon={<KeyboardArrowDownIcon fontSize="small" />}
                aria-label="Next match"
                variant="tertiary"
                size="small"
                onPress={navigateToNextMatch}
                isDisabled={!hasMatches}
              />
            </Flex>
          </>
        )}
      </Flex>
    </Box>
  );
};
