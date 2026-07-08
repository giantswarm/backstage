import { useState } from 'react';
import { IconButton, Tooltip } from '@material-ui/core';
import FileCopyOutlinedIcon from '@material-ui/icons/FileCopyOutlined';
import CheckIcon from '@material-ui/icons/Check';

/**
 * Compact icon-only copy control. Backstage's CopyTextButton renders a fixed
 * 48px icon button, which is oversized next to a small header row — this uses a
 * `size="small"` IconButton with a small icon instead.
 */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Tooltip title={copied ? 'Copied' : 'Copy'}>
      <IconButton size="small" aria-label="Copy" onClick={onCopy}>
        {copied ? (
          <CheckIcon fontSize="small" />
        ) : (
          <FileCopyOutlinedIcon fontSize="small" />
        )}
      </IconButton>
    </Tooltip>
  );
}
